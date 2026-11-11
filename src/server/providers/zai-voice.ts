import ZAI from "z-ai-web-dev-sdk";
import type {
  VoiceProvider,
  VoiceRequest,
  VoiceResult,
} from "./types";

/**
 * 配音通道实现（audio.tts）—— 镜头台词 / 旁白的语音合成。
 *
 * 通道特性：create 返回音频二进制（Response），直接取 arrayBuffer。
 * 音色策略：voiceProfile 为空时用通道默认音色；
 * 多角色区分声线的产品能力预留在此层之上（voiceProfile 落库即可生效）。
 */
export class ZaiVoiceProvider implements VoiceProvider {
  readonly name = "zai-voice";

  async synthesize(req: VoiceRequest): Promise<VoiceResult> {
    if (!req.text.trim()) {
      throw new Error("配音文本为空");
    }
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
  }
}
