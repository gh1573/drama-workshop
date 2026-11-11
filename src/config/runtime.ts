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
