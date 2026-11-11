import type {
  VideoProvider,
  VideoRenderRequest,
  VideoRenderResult,
  VideoSyncResult,
} from "./types";

/**
 * 视频通道降级实现：真实视频通道不可用时的占位（工厂 VIDEO_PROVIDER=noop 启用）。
 *
 * 语义（与既有「手动回填成片」能力对齐，能力不回退）：
 * - 镜头允许在外部工具成片后手动标记完成并粘贴地址；
 * - 本实现返回 failed + 明确原因，由任务中心透出，不阻塞创作流。
 */
export class NoopVideoProvider implements VideoProvider {
  readonly name = "noop-video";

  async render(req: VideoRenderRequest): Promise<VideoRenderResult> {
    return {
      mode: "sync",
      status: "failed",
      reason: `视频生成通道未启用（目标规格 ${req.aspectRatio} ${req.resolution} ${req.durationSeconds}s）。可在外部工具按最终提示词出片后，回到镜头轨手动标记完成并粘贴成片地址。`,
    };
  }

  async poll(): Promise<VideoSyncResult> {
    // render() 恒为同步终态，轮询不会被触发
    return { mode: "sync", status: "failed", reason: "noop 通道无异步任务" };
  }
}
