/**
 * 能力提供方（Provider）抽象 —— 全项目唯一的模型通道出口。
 *
 * 层间铁律（docs/architecture-v2.md §6）：
 * - 只有本目录允许 `import ZAI`，且只在服务端调用；
 * - 服务层永远面向 Provider 接口编程，替换底层模型不改业务代码；
 * - 每类通道一个接口 + 若干实现 + 一个工厂出口。
 */

export interface TextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TextRequest {
  messages: TextMessage[];
  /** 思考模式：拆镜/编剧类结构化任务关闭思考以提速；深度创作可开启 */
  thinking?: { type: "enabled" | "disabled" };
}

export interface TextResult {
  text: string;
}

export interface TextProvider {
  readonly name: string;
  complete(req: TextRequest): Promise<TextResult>;
}

export const IMAGE_SIZES = [
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

export interface ImageRequest {
  prompt: string;
  size: ImageSize;
}

export interface ImageResult {
  base64: string;
  size: ImageSize;
}

export interface ImageProvider {
  readonly name: string;
  generate(req: ImageRequest): Promise<ImageResult>;
}

export interface VoiceRequest {
  /** 台词文本（镜头字幕 / 旁白） */
  text: string;
  /** 角色声音画像（音色/语速偏好）；缺省用通道默认音色 */
  voiceProfile?: string | null;
}

export interface VoiceResult {
  base64: string;
  format: string;
}

export interface VoiceProvider {
  readonly name: string;
  synthesize(req: VoiceRequest): Promise<VoiceResult>;
}

export interface VideoRenderRequest {
  /** 组装管线产出的最终提示词（锚定段 + 动作 + 运镜 + 影调 + 技术）。
   * 台词不在此列：台词走 TTS 配音 + 字幕烧录链路（v2.9.4 接口面收口，
   * 移除无消费方的 subtitle 字段防误用） */
  finalPrompt: string;
  durationSeconds: number;
  resolution: string;
  aspectRatio: string;
  /**
   * 首帧参考图（公网可达 URL）——图生视频锚定的视觉载体。
   * 本地定妆照无法被外部通道访问时由调用方省略，锚点串兜底（§7.1）。
   */
  firstFrameUrl?: string;
}

/** 同步结果：渲染终态（ready/failed）或轮询中间态（processing） */
export interface VideoSyncResult {
  mode: "sync";
  status: "processing" | "ready" | "failed";
  mediaUrl?: string;
  durationMs?: number;
  reason?: string;
}

/** 异步句柄：通道已受理，调用方须持 remoteTaskId 轮询直至终态 */
export interface VideoAsyncResult {
  mode: "async";
  remoteTaskId: string;
}

export type VideoRenderResult = VideoSyncResult | VideoAsyncResult;

export interface VideoProvider {
  readonly name: string;
  /** 是否真机远程通道（占用外部配额、create 受限流约束）。
  * 占位通道（noop）为 false：提交免节流、失败为确定性配置缺失不重试
  * （v2.9.7 对齐 docs §7.4「占位模式任务秒级落 failed」的验收语义，
  * 节流与重试都是为保护真机通道而设，不应作用于本地占位）。 */
  readonly remote: boolean;
  /**
   * 提交渲染：同步通道直接返回终态；异步通道返回任务句柄，
   * 由 dispatcher 持句柄轮询 poll()（§7.4，接口对业务层不变）。
   */
  render(req: VideoRenderRequest): Promise<VideoRenderResult>;
  /** 轮询异步任务状态；仅异步通道需要实现 */
  poll(remoteTaskId: string): Promise<VideoSyncResult>;
}

/**
 * 宽松 JSON 抽取：剥离 markdown 围栏 → 截取首尾花括号 → 解析。
 * 所有 LLM 结构化输出统一走此函数，解析失败返回 null 由调用方重试。
 */
export function parseJsonLoose(raw: string): unknown | null {
  if (!raw) return null;
  const text = raw.trim().replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
