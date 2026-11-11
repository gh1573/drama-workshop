import { execFile } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import { COMPOSE_TIMEOUT_MS } from "@/config/runtime";

/**
 * 成片合成服务（docs/architecture-v2.md §7.9 v2.4）。
 *
 * 「一键成片」的第二步：全部镜头出片后，调用 scripts/assemble-episode.py
 * （ffmpeg）完成 片头卡 → 逐镜裁剪拼接 → 字幕烧录（ASS）→ 配音混音，
 * 产物落 public/assets/final_{projectId}.mp4 并回写 Project.finalVideoUrl。
 *
 * 语义：
 * - 前置校验全部镜头 ready（缺片 409，不产半成品）；
 * - 同步执行（数十秒量级），超时不写 finalVideoUrl；
 * - 重跑即重合成（覆盖旧成片），镜头轨变更后可重复执行。
 */

export interface ComposeResult {
  finalVideoUrl: string;
  clipCount: number;
  durationSec: number;
  withVoice: boolean;
}

interface AssembleOutput {
  ok: boolean;
  url?: string;
  clips?: number;
  durationSec?: number;
  withVoice?: boolean;
  error?: string;
}

export async function composeEpisode(projectId: string): Promise<ComposeResult> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new RouteError("项目不存在或已被删除", 404);

  const clips = await db.timelineClip.findMany({ where: { projectId } });
  if (clips.length === 0) {
    throw new RouteError("镜头轨为空：请先完成剧组流水线拆镜", 409);
  }
  const missing = clips.filter((c) => c.status !== "ready" || !c.mediaUrl);
  if (missing.length > 0) {
    const names = missing
      .slice(0, 3)
      .map((c) => c.name)
      .join("、");
    throw new RouteError(
      `尚有 ${missing.length} 个镜头未出片（${names}${missing.length > 3 ? "…" : ""}），请先渲染全片`,
      409
    );
  }

  const script = path.join(process.cwd(), "scripts", "assemble-episode.py");
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      "python3",
      [script, projectId],
      { timeout: COMPOSE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (err, out, stderr) => {
        if (err) {
          const tail = stderr.trim().split("\n").slice(-3).join(" ");
          reject(new Error(`成片合成执行失败：${tail || err.message}`));
        } else {
          resolve(out);
        }
      }
    );
  });

  // 脚本最后一行输出 JSON 结果（前面的行是人类可读日志）
  const lines = stdout.trim().split("\n");
  let parsed: AssembleOutput | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try {
        parsed = JSON.parse(line) as AssembleOutput;
        break;
      } catch {
        /* 不是 JSON，继续向前找 */
      }
    }
  }
  if (!parsed?.ok || !parsed.url) {
    throw new RouteError(parsed?.error ?? "成片合成失败（未返回有效结果）", 500);
  }

  // 产物自包含校验：文件真实存在且非空
  const filePath = path.join(process.cwd(), "public", parsed.url.replace(/^\//, ""));
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.size < 10_000) {
    throw new RouteError("成片产物异常（文件缺失或过小），请重试合成", 500);
  }

  await db.project.update({
    where: { id: projectId },
    data: { finalVideoUrl: parsed.url },
  });

  return {
    finalVideoUrl: parsed.url,
    clipCount: parsed.clips ?? clips.length,
    durationSec: parsed.durationSec ?? 0,
    withVoice: parsed.withVoice ?? false,
  };
}
