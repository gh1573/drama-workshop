import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { handleRouteError, ok, fail } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { BGM_MAX_BYTES, BGM_MIME_EXT } from "@/config/runtime";

type Ctx = { params: Promise<{ id: string }> };

/**
 * BGM 素材管理（v2.4.4 §7.9）：
 * - POST   上传音频（multipart form-data，字段名 file），大小/MIME 白名单校验，
 *          落 public/assets/bgm_{projectId}.{ext} + 同名 .json 元数据；
 * - GET    状态回显 { exists, name, sizeBytes }（成片面板加载时还原状态）；
 * - DELETE 清除音频与元数据（合成回落到无 BGM 行为，与 v2.4.3 一致）。
 *
 * 版权约束（§11）：产品不内置任何音乐素材，BGM 由用户上传并对版权自负。
 */

const ASSETS_DIR = path.join(process.cwd(), "public", "assets");

async function bgmPaths(projectId: string) {
  const entries = await fs.readdir(ASSETS_DIR).catch(() => [] as string[]);
  const hit = entries.find(
    (f) => f.startsWith(`bgm_${projectId}.`) && !f.endsWith(".json")
  );
  return {
    audio: hit ? path.join(ASSETS_DIR, hit) : null,
    meta: path.join(ASSETS_DIR, `bgm_${projectId}.json`),
  };
}

async function assertProject(id: string) {
  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new Error("项目不存在或已被删除");
  return project;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await assertProject(id);
    const { audio } = await bgmPaths(id);
    if (!audio) return ok({ exists: false });
    const stat = await fs.stat(audio);
    let name = path.basename(audio);
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(ASSETS_DIR, `bgm_${id}.json`), "utf8")
      );
      if (typeof meta.name === "string") name = meta.name;
    } catch {
      /* 元数据缺失时回退文件名 */
    }
    return ok({ exists: true, name, sizeBytes: stat.size });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await assertProject(id);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return fail("缺少音频文件（multipart 字段 file）", 400);
    }
    if (file.size <= 0) return fail("音频文件为空", 400);
    if (file.size > BGM_MAX_BYTES) {
      return fail(
        `音频文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 ${Math.round(BGM_MAX_BYTES / 1024 / 1024)}MB`,
        413
      );
    }
    const ext = BGM_MIME_EXT[file.type];
    if (!ext) {
      return fail(
        `不支持的音频格式（${file.type || "未知"}）：请上传 mp3 / m4a / aac / wav / ogg`,
        415
      );
    }

    // 同项目仅保留一份 BGM：旧文件先清，再落新文件与元数据
    const { audio: oldAudio } = await bgmPaths(id);
    if (oldAudio) await fs.rm(oldAudio).catch(() => undefined);

    const audioPath = path.join(ASSETS_DIR, `bgm_${id}.${ext}`);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(audioPath, buf);
    await fs.writeFile(
      path.join(ASSETS_DIR, `bgm_${id}.json`),
      JSON.stringify(
        { name: file.name, sizeBytes: file.size, uploadedAt: new Date().toISOString() },
        null,
        2
      )
    );

    return ok({ exists: true, name: file.name, sizeBytes: file.size });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await assertProject(id);
    const { audio, meta } = await bgmPaths(id);
    if (audio) await fs.rm(audio).catch(() => undefined);
    await fs.rm(meta).catch(() => undefined);
    return NextResponse.json({ ok: true, data: { exists: false } });
  } catch (err) {
    return handleRouteError(err);
  }
}
