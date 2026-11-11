import ZAI from "z-ai-web-dev-sdk";
import type {
  VoiceProvider,
  VoiceRequest,
  VoiceResult,
} from "./types";
import {
  RATE_LIMIT_BACKOFF_MS,
  RATE_LIMIT_MAX_BACKOFF_ATTEMPTS,
} from "@/config/runtime";

/**
 * 配音通道实现（audio.tts）—— 镜头台词 / 旁白的语音合成。
 *
 * 通道特性：create 返回音频二进制（Response），直接取 arrayBuffer。
 * 限流语义：与 text/video 同源的 429 指数退避 + 随机抖动（§7.8 L2 层），
 * 配额限流时任务退避重试而非直接失败。
 * 音色策略：voiceProfile 为空时用通道默认音色；
 * 多角色区分声线的产品能力预留在此层之上（voiceProfile 落库即可生效）。
 */
export class ZaiVoiceProvider implements VoiceProvider {
  readonly name = "zai-voice";

  async synthesize(req: VoiceRequest): Promise<VoiceResult> {
    if (!req.text.trim()) {
      throw new Error("配音文本为空");
    }

    let backoff = 0;
    while (true) {
      try {
        const zai = await ZAI.create();
        const response = (await zai.audio.tts.create({
          input: req.text,
          // 通道实测仅支持 wav（mp3 报 1214：不支持当前 response_format 值）
          response_format: "wav",
          ...(req.voiceProfile ? { voice: req.voiceProfile } : {}),
        })) as unknown as { arrayBuffer(): Promise<ArrayBuffer> };

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 512) {
          throw new Error("配音通道未返回音频数据");
        }
        return { base64: buffer.toString("base64"), format: "wav" };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isRateLimit =
          message.includes("429") || message.includes("Too many");
        if (isRateLimit && backoff < RATE_LIMIT_MAX_BACKOFF_ATTEMPTS) {
          const jitter = Math.random() * 0.5; // 0~50% 抖动，防批量任务同步雪崩
          const delay = RATE_LIMIT_BACKOFF_MS * 2 ** backoff * (1 + jitter);
          await new Promise((r) => setTimeout(r, delay));
          backoff += 1;
          continue;
        }
        throw err;
      }
    }
  }
}
