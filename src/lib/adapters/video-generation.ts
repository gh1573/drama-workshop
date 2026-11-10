/**
 * 视频生成适配器接口（为后续接入真实视频模型预留）
 *
 * 扩容路径：
 * 1. 实现一个新 Adapter（如 OmniVideoAdapter / ZVideoAdapter），
 *    在 createAdapter 工厂中按 modelConfig.videoModel 返回对应实现；
 * 2. 由后台任务队列调用 adapter.generate()，完成后通过
 *    project-service.updateClip() 写回 status / mediaUrl；
 * 3. 前端镜头轨的状态徽标与轮询逻辑无需任何改动。
 *
 * 当前内置 NoopAdapter：直接标记为 failed 并附原因，
 * 或由用户在镜头轨中手动「标记完成」粘贴外部成片链接。
 */

export interface VideoGenerationInput {
  clipId: string;
  /** 画面提示：节拍 description + promptGuidance + 题材影调锚点 */
  visualPrompt: string;
  /** 台词字幕（用于内嵌字幕） */
  subtitle: string;
  durationSeconds: number;
  resolution: string;
  aspectRatio: string;
}

export interface VideoGenerationResult {
  status: "ready" | "failed";
  mediaUrl?: string;
  durationMs?: number;
  reason?: string;
}

export interface VideoGenerationAdapter {
  readonly name: string;
  generate(input: VideoGenerationInput): Promise<VideoGenerationResult>;
}

export const noopAdapter: VideoGenerationAdapter = {
  name: "noop",
  async generate(input) {
    return {
      status: "failed",
      reason: `视频基模「${input.aspectRatio} ${input.resolution}」尚未接入云端生成通道，请在外部工具生成后手动标记完成并粘贴成片地址`,
    };
  },
};

export function createAdapter(videoModel: string): VideoGenerationAdapter {
  // 未来在此按 videoModel 路由到不同适配器，例如：
  // if (videoModel.startsWith("Omni 1.2 Pro")) return new OmniProAdapter();
  void videoModel;
  return noopAdapter;
}
