import type {
  VideoProvider,
  VideoRenderRequest,
  VideoRenderResult,
} from "./types";

/**
 * 视频通道降级实现：云端视频生成通道接入前的占位。
 *
 * 语义（与既有「手动回填成片」能力对齐，能力不回退）：
 * - 镜头允许在外部工具成片后手动标记完成并粘贴地址；
 * - 本实现返回 failed + 明确原因，由任务中心透出，不阻塞创作流。
 *
 * 扩容路径：实现 ZaiVideoProvider（或第三方模型适配器）并在工厂注册，
 * dispatcher / 任务中心 / 镜头状态徽标无需任何改动。
 */
export class NoopVideoProvider implements VideoProvider {
  readonly name = "noop-video";

  async render(req: VideoRenderRequest): Promise<VideoRenderResult> {
    return {
      status: "failed",
      reason: `视频生成通道尚未接入（目标规格 ${req.aspectRatio} ${req.resolution} ${req.durationSeconds}s）。可在外部工具按最终提示词出片后，回到镜头轨手动标记完成并粘贴成片地址。`,
    };
  }
}
