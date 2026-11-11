/**
 * Next.js 服务启动钩子 —— 进程启动即初始化任务调度器。
 *
 * dispatcher 模块加载时会执行孤儿恢复（DB 残留的 queued/running 任务
 * 回到内存队列/轮询池）；不挂本钩子时，恢复要等到首个任务类请求才触发，
 * 「重启后存量任务无人接管」。仅 Node runtime 生效（边缘运行时无 DB）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/server/tasks/dispatcher");
  }
}
