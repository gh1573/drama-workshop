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
