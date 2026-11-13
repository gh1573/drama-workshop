import { NextRequest } from "next/server";
import { ok, fail, handleRouteError, RouteError } from "@/lib/api-utils";
import { getProject, replaceActClips } from "@/server/services/project-service";
import {
  BreakdownChannelError,
  BreakdownError,
  breakdownAct,
} from "@/server/services/breakdown-service";
import {
  anchorProjectClips,
  bindRefsFromShots,
} from "@/server/services/run-service";
import { rebuildTracks } from "@/server/services/track-service";
import { standaloneFailureText } from "@/lib/humanize-error";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; beatIndex: string }> };

/**
 * AI 分镜拆解（导演手工补拍单场）：
 * 拆解 → 回写镜头轨（v2 协议：能量/音效/英文动作提示词）→
 * 自动绑定资产引用 → 该场镜头重新锚定组装 → 三轨确定性重铺。
 * 与流水线「导演拆镜」阶段共用同一套执行单元。
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id, beatIndex } = await ctx.params;
    const idx = Number(beatIndex);
    if (!Number.isInteger(idx) || idx < 1 || idx > 99) {
      return fail("非法的场次序号", 422);
    }

    const detail = await getProject(id);
    const target = detail.storyBeats.find((b) => b.index === idx);
    if (!target) {
      throw new RouteError(`第 ${idx} 场不存在，无法拆解`, 404);
    }

    const shots = await breakdownAct({
      genreName: detail.genreName,
      genreBadge: detail.genreBadge,
      tonePrompt: detail.genre.tonePrompt,
      synopsis: detail.synopsis,
      beats: detail.storyBeats,
      targetIndex: idx,
      assetRoster: {
        characters: detail.assets
          .filter((a) => a.kind === "character")
          .map((a) => a.name),
        scenes: detail.assets.filter((a) => a.kind === "scene").map((a) => a.name),
        props: detail.assets.filter((a) => a.kind === "prop").map((a) => a.name),
      },
    });

    const clips = await replaceActClips(id, idx, shots);
    const bound = await bindRefsFromShots(id, idx, shots, clips);
    const actClipIds = clips
      .filter((c) => c.beatIndex === idx)
      .map((c) => c.id);
    const anchored = await anchorProjectClips(id, actClipIds);
    await rebuildTracks(id);

    return ok({ shots, clips, boundRefs: bound, anchored }, 201);
  } catch (err) {
    /* v2.9.14（用户视角走查）：通道级失败不再裸透 429 JSON——
     * 单场拆解是独立动作（无阶段可续），按独立口径人话化 */
    if (err instanceof BreakdownChannelError) {
      const friendly =
        standaloneFailureText(err.message) ??
        "AI 创作通道暂时不可用，请稍后重试";
      return fail(friendly, 502, err.detail);
    }
    if (err instanceof BreakdownError) {
      return fail(err.message, 502, err.detail);
    }
    return handleRouteError(err);
  }
}
