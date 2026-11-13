import ZAI from "z-ai-web-dev-sdk";
import type { TextProvider, TextRequest, TextResult } from "./types";
import {
  RATE_LIMIT_BACKOFF_MS,
  RATE_LIMIT_MAX_BACKOFF_ATTEMPTS,
} from "@/config/runtime";

/**
 * 文本通道实现（chat.completions）。
 * - 通道级重试：网络/服务端异常重试 2 次（500ms 退避）；
 * - 限流退避（429）：按配置指数退避（默认 20s/40s/80s），
 *   上游限流是临时性失败，退避后重试而非立即失败——
 *   否则一次撞限流会浪费整条流水线的已完成阶段；
 * - 解析级重试（JSON 不合法）由调用方通过重发消息处理，不在此层。
 */
export class ZaiTextProvider implements TextProvider {
  readonly name = "zai-text";

  async complete(req: TextRequest): Promise<TextResult> {
    let lastError: unknown = null;
    let backoff = 0; // 已累计的限流退避次数
    let attempt = 0; // 常规重试次数

    while (true) {
      try {
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages: req.messages,
          ...(req.thinking ? { thinking: req.thinking } : {}),
        });
        const choice = completion.choices[0];
        const text = choice?.message?.content ?? "";
        if (text) {
          // v2.9.11：透传 finish_reason（length=被 max_tokens 截断），
          // 解析失败时剧组日志可定性根因，不再肉眼猜截断
          const finishReason = (
            choice as { finish_reason?: string } | undefined
          )?.finish_reason;
          return finishReason ? { text, finishReason } : { text };
        }
        lastError = new Error("模型返回空内容");
      } catch (err) {
        lastError = err;
        // 限流：指数退避后重试（不占用常规重试名额）——
        // v2.9.13 退避事件回调：让调用方写剧组日志，用户看到「通道在自救」而非盲等
        if (
          backoff < RATE_LIMIT_MAX_BACKOFF_ATTEMPTS &&
          err instanceof Error &&
          err.message.includes("429")
        ) {
          const waitMs = RATE_LIMIT_BACKOFF_MS * 2 ** backoff;
          backoff++;
          req.onRetry?.({
            kind: "rate_limit",
            attempt: backoff,
            waitMs,
            message: err.message.slice(0, 120),
          });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }
      attempt++;
      if (attempt >= 3) break;
      req.onRetry?.({
        kind: "generic",
        attempt,
        waitMs: 500,
        message:
          lastError instanceof Error
            ? lastError.message.slice(0, 120)
            : String(lastError).slice(0, 120),
      });
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
      `文本通道调用失败：${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }
}
