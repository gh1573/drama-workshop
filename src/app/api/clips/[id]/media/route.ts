import { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ok, fail, handleRouteError, RouteError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import {
  CLIP_MEDIA_MAX_BYTES,
  CLIP_MEDIA_MIME_EXT,
} from "@/config/runtime";

/**
 * 镜头成片外部入库（v2.9.8 §7.9 外部出片闭环）：
 * - JSON { url }  ：http(s) 地址 → 服务端下载落盘（自包含纪律：合成不依赖外链，
 *                   与视频通道产物 persistVideoFile 同款语义），失败给可读原因；
 * - multipart file：本地文件直传（视频限额下外部工具出片的主要通道）；
 * 两种方式统一：落 public/assets/clip_{clipId}.{ext} → ffprobe 实际时长 →
 * 短素材对齐 plannedMs（防字幕/配音漂移）→ 镜头标记 ready + 本地地址。
 */
type Ctx = { params: Promise<{ id: string }> };

const ASSETS_DIR = path.join(process.cwd(), "public", "assets");

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 清掉该镜头旧入库文件（换格式重贴不留孤儿） */
async function removeStaleClipMedia(clipId: string, keep: string) {
  const entries = await fs.readdir(ASSETS_DIR).catch(() => [] as string[]);
  for (const f of entries) {
    if (f.startsWith(`clip_${clipId}.`) && f !== keep) {
      await fs.rm(path.join(ASSETS_DIR, f)).catch(() => undefined);
    }
  }
}

/** ffprobe 实际时长（秒 → 毫秒）；探测失败返回 null（不阻断入库） */
function probeDurationMs(file: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { timeout: 10_000 },
      (err, out) => {
        if (err) return resolve(null);
        const sec = parseFloat(out.trim());
        resolve(Number.isFinite(sec) && sec > 0 ? Math.round(sec * 1000) : null);
      }
    );
  });
}

/** URL 下载（Content-Length 预检 + 上限硬校验 + 视频性初检） */
async function downloadMedia(url: string): Promise<{ buf: Buffer; ext: string }> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (e) {
    throw new RouteError(`地址无法访问（${e instanceof Error ? e.message : "网络异常"}），请核对链接可用性`, 502);
  }
  if (!res.ok) {
    throw new RouteError(`下载失败（HTTP ${res.status}），请核对链接是否可公开访问`, 502);
  }
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > CLIP_MEDIA_MAX_BYTES) {
    throw new RouteError(`文件过大（${mb(declared)}），上限 ${mb(CLIP_MEDIA_MAX_BYTES)}`, 413);
  }
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const mimeExt = CLIP_MEDIA_MIME_EXT[mime];
  /* 扩展名解析：MIME 白名单优先，octet-stream 回落 URL 路径后缀 */
  let ext = "";
  if (mimeExt && mimeExt !== "bin") ext = mimeExt;
  else {
    const fromUrl = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
    if (["mp4", "mov", "webm", "mkv"].includes(fromUrl)) ext = fromUrl;
    else if (mimeExt === "bin") {
      throw new RouteError(`目标不是视频文件（Content-Type: ${mime || "未知"}），请粘贴直链视频地址`, 415);
    } else {
      throw new RouteError(`不支持的格式（${mime || "未知"}）：请使用 mp4 / mov / webm / mkv 直链`, 415);
    }
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) {
    throw new RouteError("下载数据异常（<1KB），疑似不是视频文件", 415);
  }
  if (buf.length > CLIP_MEDIA_MAX_BYTES) {
    throw new RouteError(`文件过大（${mb(buf.length)}），上限 ${mb(CLIP_MEDIA_MAX_BYTES)}`, 413);
  }
  return { buf, ext };
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const clip = await db.timelineClip.findUnique({ where: { id } });
    if (!clip) return fail("镜头片段不存在或已被删除", 404);

    const contentType = req.headers.get("content-type") ?? "";
    let buf: Buffer;
    let ext: string;
    let sourceKind: "download" | "upload";

    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as { url?: string } | null;
      const url = body?.url?.trim();
      if (!url || !/^https?:\/\//.test(url)) {
        return fail("请提供 http(s) 视频直链地址", 422);
      }
      const downloaded = await downloadMedia(url);
      buf = downloaded.buf;
      ext = downloaded.ext;
      sourceKind = "download";
    } else {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) {
        return fail("缺少视频文件（multipart 字段 file）或 JSON 字段 url", 400);
      }
      if (file.size <= 0) return fail("视频文件为空", 400);
      if (file.size > CLIP_MEDIA_MAX_BYTES) {
        return fail(
          `视频文件过大（${mb(file.size)}），上限 ${mb(CLIP_MEDIA_MAX_BYTES)}`,
          413
        );
      }
      ext = CLIP_MEDIA_MIME_EXT[file.type] ?? "";
      if (!ext || ext === "bin") {
        const fromName = path.extname(file.name).replace(".", "").toLowerCase();
        ext = ["mp4", "mov", "webm", "mkv"].includes(fromName) ? fromName : "";
      }
      if (!ext) {
        return fail(
          `不支持的视频格式（${file.type || "未知"}）：请上传 mp4 / mov / webm / mkv`,
          415
        );
      }
      buf = Buffer.from(await file.arrayBuffer());
      sourceKind = "upload";
    }

    const fileName = `clip_${clip.id}.${ext}`;
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    await removeStaleClipMedia(clip.id, fileName);
    await fs.writeFile(path.join(ASSETS_DIR, fileName), buf);

    const localUrl = `/assets/${fileName}`;

    /* 时长对齐：合成按 plannedMs 截取与排字幕/配音轨——素材短于计划会让后续
       镜头的音画整体漂移；对齐到素材实际时长（长于计划不受影响，-t 截取） */
    const mediaDurationMs = await probeDurationMs(path.join(ASSETS_DIR, fileName));
    const plannedMs = clip.plannedMs ?? 3000;
    const alignShort =
      mediaDurationMs != null && mediaDurationMs < plannedMs - 500
        ? mediaDurationMs
        : null;

    const updated = await db.timelineClip.update({
      where: { id: clip.id },
      data: {
        status: "ready",
        mediaUrl: localUrl,
        ...(alignShort ? { plannedMs: alignShort } : {}),
      },
    });

    return ok({
      mediaUrl: updated.mediaUrl,
      sizeBytes: buf.length,
      sourceKind,
      mediaDurationMs,
      plannedMs: updated.plannedMs,
      durationAligned: alignShort != null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
