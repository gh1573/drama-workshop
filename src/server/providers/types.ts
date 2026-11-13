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
 * 宽松 JSON 抽取与修复：所有 LLM 结构化输出统一走此函数。
 *
 * 修复链（逐级尝试，命中即返回；全部失败返回 null 由调用方重试）：
 * 1. 剥离 markdown 围栏；
 * 2. 顶层数组直取（模型偶尔忽略「包一层对象」的指令）；
 * 3. 首尾花括号截取 + 直接解析；
 * 4. 尾逗号清理（], / }, 前的逗号——模型高频笔误）；
 * 5. 字符串内裸控制字符转义（换行/回车/制表——JSON.parse 对字符串内
 *    字面换行是硬错误，视觉短剧描述文案里换行并不罕见）；
 * 6. 截断修复：输出被 max_tokens 切断时，回退到最后一个完整元素并
 *    按括号栈补全闭合（丢尾部残片但保住已完整部分——对「shots 数组
 *    只要 ≥2 个完整镜头即可用」的调用方足够）。
 */
function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** 字符串字面量内的裸换行/回车/制表符转义为 \n \r \t（字面量外原样保留） */
function escapeRawControls(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) {
        out += ch;
        esc = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = false;
        out += ch;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}

/** 截断修复：扫描括号栈，回退到最后一个完整元素并按【该时刻】的栈快照
 *  补全闭合——不能用扫描结束时的栈：残片元素的开括号在切片之外，
 *  按终态栈闭合会多补（v2.9.9 单测抓出） */
function repairTruncated(s: string): string | null {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastComplete = -1;
  let snapshot: string[] | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) return null; // 结构本就完整，截断修复无能为力
      lastComplete = i;
      snapshot = [...stack];
    }
  }
  if (lastComplete === -1 || !snapshot) return null;
  let repaired = s.slice(0, lastComplete + 1).replace(/[,\s]+$/, "");
  for (let i = snapshot.length - 1; i >= 0; i--) {
    repaired += snapshot[i] === "{" ? "}" : "]";
  }
  return repaired;
}

/** 对候选串依次施加修复链；返回首个可解析结果 */
function parseWithRepairs(candidate: string): unknown {
  return (
    tryParse(candidate) ??
    tryParse(candidate.replace(/,\s*([}\]])/g, "$1")) ??
    tryParse(escapeRawControls(candidate)) ??
    (() => {
      const decommad = candidate.replace(/,\s*([}\]])/g, "$1");
      const escaped = escapeRawControls(decommad);
      const repaired = repairTruncated(escaped);
      return repaired === null ? null : tryParse(repaired);
    })()
  );
}

export function parseJsonLoose(raw: string): unknown | null {
  if (!raw) return null;
  const text = raw.trim().replace(/```(?:json)?/gi, "").trim();

  // 形态一：顶层数组直取（含截断修复：栈扫描对 [...] 同样适用）
  if (text.startsWith("[")) {
    const endArr = text.lastIndexOf("]");
    const candidate = endArr > 0 ? text.slice(0, endArr + 1) : text;
    const hit = parseWithRepairs(candidate);
    if (hit !== null) return hit;
  }

  // 形态二：对象形态（首 { 起截取；尾 } 缺失时由截断修复兑底）
  const start = text.indexOf("{");
  if (start !== -1) {
    const end = text.lastIndexOf("}");
    const candidate = end > start ? text.slice(start, end + 1) : text.slice(start);
    const hit = parseWithRepairs(candidate);
    if (hit !== null) return hit;
    // } 之后还有被截断内容的形态：从 { 起全段截断修复
    if (end > start) {
      const repaired = repairTruncated(text.slice(start));
      const hit2 = repaired === null ? null : tryParse(repaired);
      if (hit2 !== null) return hit2;
    }
  }

  // 形态三：前缀文本 + 数组（「拆解如下：[…]」——对象形态全败后兑底）
  const aStart = text.indexOf("[");
  if (aStart !== -1) {
    const aEnd = text.lastIndexOf("]");
    const candidate = aEnd > aStart ? text.slice(aStart, aEnd + 1) : text.slice(aStart);
    const hit = parseWithRepairs(candidate);
    if (hit !== null) return hit;
  }
  return null;
}
