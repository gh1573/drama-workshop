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

export interface VideoRenderRequest {
  /** 组装管线产出的最终提示词（锚定段 + 动作 + 运镜 + 影调 + 技术） */
  finalPrompt: string;
  subtitle: string;
  durationSeconds: number;
  resolution: string;
  aspectRatio: string;
}

export interface VideoRenderResult {
  status: "ready" | "failed";
  mediaUrl?: string;
  durationMs?: number;
  reason?: string;
}

export interface VideoProvider {
  readonly name: string;
  /** 同步渲染；未来异步通道由 dispatcher 持句柄轮询，接口不变 */
  render(req: VideoRenderRequest): Promise<VideoRenderResult>;
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
