import type { TaskKind } from "@/lib/drama";

/**
 * 运行时参数配置（docs/architecture-v2.md §7.8 · L2 层）
 *
 * 规则：
 * - 所有参数带类型化默认值，可用环境变量覆盖；
 * - 业务模块禁止直接读 process.env，统一从这里取；
 * - 本文件只做「读取 + 类型化」，不含业务逻辑，禁止反向依赖服务层。
 */

/** 环境变量整数读取：缺失/非法/非正数时回退默认值 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 各通道并发上限（防打爆外部通道）。
 * 覆盖变量：DISPATCH_CONCURRENCY_PORTRAIT / DISPATCH_CONCURRENCY_VIDEO / DISPATCH_CONCURRENCY_VOICEOVER
 */
export const DISPATCH_CONCURRENCY: Record<TaskKind, number> = {
  portrait: envInt("DISPATCH_CONCURRENCY_PORTRAIT", 2),
  video: envInt("DISPATCH_CONCURRENCY_VIDEO", 2),
  voiceover: envInt("DISPATCH_CONCURRENCY_VOICEOVER", 4),
};

/** 调度器轮询间隔（毫秒）。覆盖变量：DISPATCH_TICK_INTERVAL_MS */
export const DISPATCH_TICK_INTERVAL_MS = envInt(
  "DISPATCH_TICK_INTERVAL_MS",
  600
);

/**
 * 孤儿任务回收窗口（毫秒）：running 且超过该窗口无更新的记录，
 * 进程启动时判定为中断并回置。同时用于 ProductionRun 流水线恢复。
 * 覆盖变量：ORPHAN_RECOVERY_WINDOW_MS
 */
export const ORPHAN_RECOVERY_WINDOW_MS = envInt(
  "ORPHAN_RECOVERY_WINDOW_MS",
  3 * 60_000
);

/** 任务中心列表单次返回上限（API 分页）。覆盖变量：TASK_LIST_LIMIT */
export const TASK_LIST_LIMIT = envInt("TASK_LIST_LIMIT", 50);

/**
 * 视频异步任务轮询间隔（毫秒）：dispatcher 对每个在途任务至少间隔该时长查询一次。
 * 实测单镜成片约 60~90s，轮询粒度无需过密，避免撞通道限流。
 * 覆盖变量：VIDEO_POLL_INTERVAL_MS
 */
export const VIDEO_POLL_INTERVAL_MS = envInt("VIDEO_POLL_INTERVAL_MS", 8_000);

/** 视频异步任务轮询超时（毫秒）：超时按失败处理（可重试回队）。覆盖变量：VIDEO_POLL_TIMEOUT_MS */
export const VIDEO_POLL_TIMEOUT_MS = envInt("VIDEO_POLL_TIMEOUT_MS", 5 * 60_000);

/**
 * 视频通道在途上限：同时处于「生成中」的任务数（已提交未出片）。
 * 提交（create）与轮询（query）均为轻量调用，真正受限的是通道侧并行生成数。
 * 覆盖变量：VIDEO_INFLIGHT_LIMIT
 */
export const VIDEO_INFLIGHT_LIMIT = envInt("VIDEO_INFLIGHT_LIMIT", 3);

/**
 * 视频通道提交节流（毫秒）：两次 create 之间的全局最小间隔。
 * 实测通道对 create 频率敏感（批量瞬时提交触发 429），节流是第一道闸；
 * 第二道闸是 provider 内的 429 指数退避（含随机抖动防雪崩）。
 * 覆盖变量：VIDEO_SUBMIT_INTERVAL_MS
 */
export const VIDEO_SUBMIT_INTERVAL_MS = envInt("VIDEO_SUBMIT_INTERVAL_MS", 12_000);

/**
 * 上游限流（429）指数退避基数（毫秒）：20s → 40s → 80s。
 * 覆盖变量：RATE_LIMIT_BACKOFF_MS
 */
export const RATE_LIMIT_BACKOFF_MS = envInt("RATE_LIMIT_BACKOFF_MS", 20_000);

/** 限流退避最大次数（超过后按常规失败处理）。覆盖变量：RATE_LIMIT_MAX_BACKOFF_ATTEMPTS */
export const RATE_LIMIT_MAX_BACKOFF_ATTEMPTS = envInt(
  "RATE_LIMIT_MAX_BACKOFF_ATTEMPTS",
  3
);

/**
 * 成片合成超时（毫秒）：compose 调用 ffmpeg 合成整集的等待上限。
 * 十余镜头的整集合成通常数十秒完成；超时按失败处理（不写 finalVideoUrl）。
 * 覆盖变量：COMPOSE_TIMEOUT_MS
 */
export const COMPOSE_TIMEOUT_MS = envInt("COMPOSE_TIMEOUT_MS", 4 * 60_000);

/**
 * 参考图公网回源基址（§7.1.4 参考图注入）：
 * 外部视频通道无法访问本地相对路径（/assets/asset_xxx.png），
 * 非空时视频任务以 `${base}${portraitUrl}` 构造镜头主要角色定妆图的首帧参考地址（image_url）；
 * 为空 = 不注入首帧参考，提示词内的视觉锚点串兜底（与 v2.4.1 行为一致）。
 * 覆盖变量：PUBLIC_ASSETS_BASE_URL（无默认值 —— 显式配置才启用）
 */
export const PUBLIC_ASSETS_BASE_URL = process.env.PUBLIC_ASSETS_BASE_URL?.trim() ?? "";

/* ============================================================
 * 成片音频专业化参数（§7.9 v2.4.4）
 * compose-service 读取后经 CLI 参数传入 assemble-episode.py，
 * Python 脚本自身不读环境变量、不含默认值（零硬编码）。
 * ============================================================ */

/** 环境变量小数读取：缺失/非法时回退默认值（允许负数） */
function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 成片响度归一目标积分响度（EBU R128，§7.9 v2.4.4）：
 * 短剧/流媒体平台惯例 -16 LUFS（广播档 -24、流媒体高响度档 -14 之间取中）。
 * 单位 LUFS。覆盖变量：LOUDNORM_I
 */
export const LOUDNORM_I = envFloat("LOUDNORM_I", -16);

/** 响度归一真峰值上限（单位 dBTP，防削波）。覆盖变量：LOUDNORM_TP */
export const LOUDNORM_TP = envFloat("LOUDNORM_TP", -1.5);

/** 响度归一响度范围（LRA，单位 LU，越大动态保留越多）。覆盖变量：LOUDNORM_LRA */
export const LOUDNORM_LRA = envFloat("LOUDNORM_LRA", 11);

/**
 * BGM 混音基础增益（线性系数 0~1，§7.9 v2.4.4）：
 * 0.14 ≈ -17 dB，铺底不抢对白；对白处另有侧链闪避再压一档。
 * 覆盖变量：BGM_VOLUME
 */
export const BGM_VOLUME = envFloat("BGM_VOLUME", 0.14);

/**
 * BGM 对白侧链闪避强度（0~1，§7.9 v2.4.4）：
 * 0 = 不闪避；1 = 对白出现时 BGM 完全压到底。默认 0.7（压约 10dB）。
 * 覆盖变量：BGM_DUCK_AMOUNT
 */
export const BGM_DUCK_AMOUNT = envFloat("BGM_DUCK_AMOUNT", 0.7);

/** BGM 上传文件大小上限（字节，默认 10MB）。覆盖变量：BGM_MAX_BYTES */
export const BGM_MAX_BYTES = envInt("BGM_MAX_BYTES", 10 * 1024 * 1024);

/**
 * BGM 上传 MIME 白名单（§7.9 v2.4.4）：音频容器防滥用；
 * 扩展名映射仅用于落盘文件后缀，ffmpeg 按真实内容探测。
 */
export const BGM_MIME_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/x-wav": "wav",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
};

/* ============================================================
 * 成片画幅与转场参数（§7.9 / §7.11 v2.5）
 * compose-service 读取后经 CLI 参数传入 assemble-episode.py，
 * Python 脚本自身不读环境变量、不含默认值（零硬编码）。
 * ============================================================ */

/** 成片帧率（fps，与视频生成通道 fps 对齐）。覆盖变量：COMPOSE_FPS */
export const COMPOSE_FPS = envInt("COMPOSE_FPS", 30);

/**
 * 转场时长（秒，§7.11 v2.5）：xfade 交叉溶解 / 压黑的重叠时长。
 * 短剧节奏以快为主，0.5s 是「有转场感但不拖节奏」的经验档。
 * 覆盖变量：TRANSITION_SECONDS
 */
export const TRANSITION_SECONDS = envFloat("TRANSITION_SECONDS", 0.5);

/** 分辨率档位 → 短边像素（与 genres.ts RESOLUTIONS 对齐，映射中心在此） */
const RESOLUTION_SHORT_EDGE: Record<string, number> = {
  "540p": 540,
  "720p": 720,
  "1080p": 1080,
};

/**
 * 画幅像素映射（§7.9 v2.5）：项目 aspectRatio × resolution → 成片 width/height。
 * 9:16 竖版以「宽 = 档位像素」为准（720p → 720x1280），16:9 横版以「高 = 档位像素」为准，
 * 1:1 方版边长相等；未登记档位/画幅回落 720x1280（与 v2.4 行为一致）。
 */
export function composeDimensions(
  aspectRatio: string,
  resolution: string
): { width: number; height: number } {
  const short = RESOLUTION_SHORT_EDGE[resolution] ?? 720;
  switch (aspectRatio) {
    case "9:16":
      return { width: short, height: Math.round((short * 16) / 9) };
    case "16:9":
      return { width: Math.round((short * 16) / 9), height: short };
    case "1:1":
      return { width: short, height: short };
    default:
      return { width: 720, height: 1280 };
  }
}
