import { NextRequest } from "next/server";
import { GENRES } from "@/lib/genres";
import { fail, ok, handleRouteError } from "@/lib/api-utils";
import { getTextProvider } from "@/server/providers";
import type { StoryBeat } from "@/lib/drama";
import {
  buildScreenplayMessages,
  parseScreenplayBeats,
} from "@/server/services/screenplay";

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
    for (let attempt = 0; attempt < 2 && !beats; attempt++) {
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
        lastRaw = err instanceof Error ? err.message : String(err);
      }
    }

    if (!beats) {
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
