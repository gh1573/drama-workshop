import { NextRequest } from "next/server";
import { GENRES } from "@/lib/genres";
import { fail, ok, handleRouteError } from "@/lib/api-utils";
import { getTextProvider } from "@/server/providers";
import type { StoryBeat } from "@/lib/drama";
import {
  buildScreenplayMessages,
  parseScreenplayBeats,
} from "@/server/services/screenplay";
import { standaloneFailureText } from "@/lib/humanize-error";

export const maxDuration = 300;

/**
 * 快速推演（副路径，不立项）：「只想先试试剧本」。
 * v2.7：提示词与解析统一走 screenplay.ts（与剧组流水线编剧阶段同源，
 * 场次化剧本 3~6 场）；LLM 调用改经 Provider 通道——
 * 与流水线共享 429 指数退避，快速推演撞限流不再直接失败。
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      genreId?: string;
      synopsis?: string;
      modelConfig?: {
        videoModel?: string;
        durationSeconds?: number;
        resolution?: string;
        scriptThinkingLevel?: "low" | "medium" | "high";
        enablePromptEnhance?: boolean;
      };
    };

    const genre = GENRES.find((g) => g.id === body.genreId);
    if (!genre) {
      return fail("未知的题材，请重新选择", 400);
    }
    const synopsis = (body.synopsis ?? "").trim();
    if (synopsis.length < 10) {
      return fail("剧情梗概太短，请输入至少 10 个字的梗概", 400);
    }

    const cfg = body.modelConfig ?? {};
    const thinkingLevel = ["low", "medium", "high"].includes(
      cfg.scriptThinkingLevel ?? ""
    )
      ? (cfg.scriptThinkingLevel as "low" | "medium" | "high")
      : "low";
    const enhance = cfg.enablePromptEnhance !== false;
    const duration = [3, 5, 8].includes(cfg.durationSeconds ?? 5)
      ? (cfg.durationSeconds ?? 5)
      : 5;
    const resolution = ["540p", "720p", "1080p"].includes(cfg.resolution ?? "")
      ? (cfg.resolution as string)
      : "720p";

    const messages = buildScreenplayMessages({
      genreName: genre.name,
      genreBadge: genre.badge,
      hookTactic: genre.hookTactic,
      musicMood: genre.musicMood,
      tonePrompt: genre.tonePrompt,
      synopsis,
      durationSeconds: duration,
      resolution,
      thinkingLevel,
      enhance,
    });

    const provider = getTextProvider();
    let beats: StoryBeat[] | null = null;
    let lastRaw = "";
    /* v2.9.14（用户视角走查 P1：429 误诊）：通道级失败（限流/网络/超时）与
       解析级失败（模型有输出但不合工单）必须分流——此前一律报「未能通过解析，
       请调整梗概」，撞限流的用户会被误导去改梗概，而真正该做的只是等两分钟 */
    let channelError: string | null = null;
    for (let attempt = 0; attempt < 2 && !beats; attempt++) {
      channelError = null; // 以最后一轮的失败性质定调
      try {
        const { text } = await provider.complete({
          messages: [
            messages[0],
            {
              role: "user",
              content:
                attempt === 0
                  ? messages[1].content
                  : `${messages[1].content}\n\n注意：上一次输出无法解析。请严格只输出一个合法 JSON 对象（含 storyBeats 数组），不要任何其他文字。`,
            },
          ],
          thinking: { type: thinkingLevel === "low" ? "disabled" : "enabled" },
        });
        lastRaw = text;
        beats = parseScreenplayBeats(text);
      } catch (err) {
        channelError = err instanceof Error ? err.message : String(err);
        lastRaw = channelError;
        /* 通道级失败（限流/网络/超时）：provider 内部已做 20/40/80s 退避重试，
           「更严格的 JSON 格式指令」救不了通道——立即终止，不让用户白等第二轮退避 */
        break;
      }
    }

    if (!beats) {
      if (channelError) {
        // 通道级失败：人话化（独立动作口径），技术原始错误进 detail 供排障
        const friendly =
          standaloneFailureText(channelError) ??
          "AI 创作通道暂时不可用，请稍后重试";
        return fail(friendly, 502, channelError.slice(0, 300));
      }
      return fail(
        "AI 返回内容未能通过解析，请稍后重试或调整梗概后重试",
        502,
        lastRaw.slice(0, 300)
      );
    }

    return ok({ storyBeats: beats });
  } catch (err) {
    return handleRouteError(err);
  }
}
