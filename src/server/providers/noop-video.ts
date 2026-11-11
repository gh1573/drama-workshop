import type {
  VideoProvider,
  VideoRenderRequest,
  VideoRenderResult,
  VideoSyncResult,
} from "./types";

/**
 * 视频通道缺省实现（docs §7.4 通道缺省策略，v2.4.3）。
 *
 * 缺省语义（配额墙根除）：
 * - 批量流水线/一键渲染永不消耗视频配额——真实通道需显式 VIDEO_PROVIDER=zai opt-in；
 * - 本实现返回 failed + 可读引导，任务中心透出，不阻塞创作流；
 * - 与既有「手动回填成片」能力对齐：外部工具出片后可回镜头轨粘贴地址。
 */
export class NoopVideoProvider implements VideoProvider {
  readonly name = "noop-video";

  async render(req: VideoRenderRequest): Promise<VideoRenderResult> {
    return {
      mode: "sync",
      status: "failed",
      reason: `视频真机通道未启用（占位模式，零配额消耗；目标规格 ${req.aspectRatio} ${req.resolution} ${req.durationSeconds}s）。两种出片方式：① 配额窗口可用时设 VIDEO_PROVIDER=zai 重启后重试此镜；② 外部工具按最终提示词出片后，回镜头轨手动标记完成并粘贴成片地址。`,
    };
  }

  async poll(): Promise<VideoSyncResult> {
    // render() 恒为同步终态，轮询不会被触发
    return { mode: "sync", status: "failed", reason: "noop 通道无异步任务" };
  }
}
