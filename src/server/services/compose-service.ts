import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import {
  BGM_DUCK_AMOUNT,
  BGM_VOLUME,
  COMPOSE_FPS,
  COMPOSE_TIMEOUT_MS,
  COMPOSE_X264_PRESET,
  LOUDNORM_I,
  LOUDNORM_LRA,
  LOUDNORM_TP,
  TRANSITION_SECONDS,
  composeDimensions,
} from "@/config/runtime";
import { GRADE_PRESETS } from "@/config/templates";

/**
 * 成片合成服务（docs/architecture-v2.md §7.9 v2.4 → v2.5）。
 *
 * 「一键成片」的第二步：全部镜头出片后，调用 scripts/assemble-episode.py
 * （ffmpeg）完成 片头卡 → 逐镜裁剪拼接 → 转场矩阵（§7.11）→ 全片调色（§7.11）→
 * 字幕烧录（ASS）→ 配音混音，
 * 产物落 public/assets/final_{projectId}.mp4 并回写 Project.finalVideoUrl。
 *
 * 语义：
 * - 前置校验全部镜头 ready（缺片 409，不产半成品）；
 * - 同步执行（数十秒量级），超时不写 finalVideoUrl；
 * - 重跑即重合成（覆盖旧成片），镜头轨变更后可重复执行；
 * - v2.5：画幅由项目 aspectRatio × resolution 映射（composeDimensions，L2），
 *   转场策略/调色预设取项目级 L4 字段（transitionMode/gradePreset）。
 */

export interface ComposeResult {
  finalVideoUrl: string;
  clipCount: number;
  durationSec: number;
  withVoice: boolean;
  withBgm: boolean;
}

/** Python 解释器解析（v2.9.10 环境韧性）：
 *  assemble-episode.py 的 draw_card 依赖 PIL——dev server 子进程的 PATH
 *  解析可能落在无 PIL 的系统 python 上（实测：沙箱回收后 venv 重建差异，
 *  合成 500 且原因被截在 Python 栈尾部）。解析顺序：
 *  1. 显式 DRAMA_PYTHON（运维覆写）；
 *  2. ~/.venv/bin/python3（存在即用——预装 PIL/numpy 的用户 venv）；
 *  3. PATH 上的 python3（其他部署环境）。
 *  解析一次即缓存（进程内稳定）。 */
const VENV_PYTHON = path.join(os.homedir(), ".venv", "bin", "python3");
let cachedPython: string | null = null;
function resolvePython(): string {
  if (cachedPython) return cachedPython;
  if (process.env.DRAMA_PYTHON) return (cachedPython = process.env.DRAMA_PYTHON);
  if (existsSync(VENV_PYTHON)) return (cachedPython = VENV_PYTHON);
  return (cachedPython = "python3");
}

interface AssembleOutput {
  ok: boolean;
  url?: string;
  clips?: number;
  durationSec?: number;
  withVoice?: boolean;
  withBgm?: boolean;
  transitions?: number;
  width?: number;
  height?: number;
  graded?: boolean;
  error?: string;
}

/**
 * 调色预设解析（§7.11 v2.5）：L4 用户覆写优先，空则跟随题材（L3 按 genreId 映射）。
 * 仅返回 L3 白名单命中项，拒绝任意字符串注入。
 */
function resolveGradeFilter(
  gradePreset: string | null,
  genreId: string
): string {
  const key = gradePreset?.trim() || genreId;
  return GRADE_PRESETS[key]?.filter ?? GRADE_PRESETS.neutral.filter;
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
  // L2 音频/画幅/转场参数 + L3 调色滤镜 + L4 用户覆写，经 CLI 传入（§7.9 v2.5：脚本自身零硬编码）
  const { width, height } = composeDimensions(
    project.aspectRatio,
    project.resolution
  );
  const args = [
    "--width", String(width),
    "--height", String(height),
    "--fps", String(COMPOSE_FPS),
    "--transitions", project.transitionMode || "auto",
    "--transition-duration", String(TRANSITION_SECONDS),
    "--grade-filter", resolveGradeFilter(project.gradePreset, project.genreId),
    "--loudnorm-i", String(LOUDNORM_I),
    "--loudnorm-tp", String(LOUDNORM_TP),
    "--loudnorm-lra", String(LOUDNORM_LRA),
    "--bgm-volume", String(BGM_VOLUME),
    "--bgm-duck-amount", String(BGM_DUCK_AMOUNT),
    "--x264-preset", COMPOSE_X264_PRESET,
  ];
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      resolvePython(),
      [script, projectId, ...args],
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

  /* v2.9.2 封面帧抽取：合成即产 poster（约定路径 final_{id}_poster.jpg，
     前端 <video poster> 按约定引用，404 时浏览器自动回退黑帧——不落库、不迁移）。
     抽 25% 时长处（跳过片头卡暗场，取剧情中段高燃帧）；失败仅日志不阻断——
     封面是增强，合成主产物已就绪不能因海报翻车 */
  await extractPosterFrame(filePath).catch((e) => {
    console.warn(`[compose] 封面帧抽取失败（不影响成片）: ${e instanceof Error ? e.message : e}`);
  });

  await db.project.update({
    where: { id: projectId },
    // v2.9.11：交付状态闭环——此前仅回写 finalVideoUrl，status 永远停在
    // 「制作中」，项目库/信息卡对已交付项目展示过时徽标；
    // 补拍/改镜头（createClip/updateClip）会把状态拉回「制作中」，
    // 重新合成后再次交付——状态随劳动成果生命周期自然流转
    data: { finalVideoUrl: parsed.url, status: "delivered" },
  });

  return {
    finalVideoUrl: parsed.url,
    clipCount: parsed.clips ?? clips.length,
    durationSec: parsed.durationSec ?? 0,
    withVoice: parsed.withVoice ?? false,
    withBgm: parsed.withBgm ?? false,
  };
}

/** 成片封面帧：25% 时长处抽一帧，810 宽（9:16 高清档），落 {成片路径}_poster.jpg */
async function extractPosterFrame(finalMp4Path: string): Promise<string> {
  const posterPath = finalMp4Path.replace(/\.mp4$/, "_poster.jpg");
  const durSec = await new Promise<number>((resolve, reject) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", finalMp4Path],
      { timeout: 10_000 },
      (err, out) => (err ? reject(err) : resolve(parseFloat(out.trim()) || 0))
    );
  });
  const seek = Math.max(1, Math.round(durSec * 0.25));
  await new Promise<void>((resolve, reject) => {
    execFile(
      "ffmpeg",
      ["-y", "-v", "error", "-ss", String(seek), "-i", finalMp4Path,
        "-frames:v", "1", "-vf", "scale=810:-2", "-q:v", "4", posterPath],
      { timeout: 20_000 },
      (err) => (err ? reject(err) : resolve())
    );
  });
  return posterPath;
}
