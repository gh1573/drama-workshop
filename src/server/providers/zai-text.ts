import ZAI from "z-ai-web-dev-sdk";
import type { TextProvider, TextRequest, TextResult } from "./types";

/**
 * 文本通道实现（chat.completions）。
 * - 通道级重试：网络/服务端异常重试 2 次（500ms 退避）；
 * - 解析级重试（JSON 不合法）由调用方通过重发消息处理，不在此层。
 */
export class ZaiTextProvider implements TextProvider {
  readonly name = "zai-text";

  async complete(req: TextRequest): Promise<TextResult> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages: req.messages,
          ...(req.thinking ? { thinking: req.thinking } : {}),
        });
        const text = completion.choices[0]?.message?.content ?? "";
        if (text) return { text };
        lastError = new Error("模型返回空内容");
      } catch (err) {
        lastError = err;
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
      `文本通道调用失败：${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }
}
