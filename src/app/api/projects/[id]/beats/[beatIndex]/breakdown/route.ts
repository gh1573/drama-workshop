import { NextRequest } from "next/server";
import { ok, fail, handleRouteError, RouteError } from "@/lib/api-utils";
import { getProject, replaceActClips } from "@/server/services/project-service";
import {
  BreakdownError,
  breakdownAct,
} from "@/server/services/breakdown-service";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; beatIndex: string }> };

/**
 * AI 分镜拆解：把指定一幕拆成 3~5 个镜头组，替换该幕在镜头轨上的片段。
 * 前置条件：项目已保存；该幕没有已生成（ready）的镜头。
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id, beatIndex } = await ctx.params;
    const idx = Number(beatIndex);
    if (!Number.isInteger(idx) || idx < 1 || idx > 99) {
      return fail("非法的幕序号", 422);
    }

    const detail = await getProject(id);
    const target = detail.storyBeats.find((b) => b.index === idx);
    if (!target) {
      throw new RouteError(`第 ${idx} 幕不存在，无法拆解`, 404);
    }

    const shots = await breakdownAct({
      genreName: detail.genreName,
      genreBadge: detail.genreBadge,
      tonePrompt: detail.genre.tonePrompt,
      synopsis: detail.synopsis,
      beats: detail.storyBeats,
      targetIndex: idx,
    });

    const clips = await replaceActClips(id, idx, shots);
    return ok({ shots, clips }, 201);
  } catch (err) {
    if (err instanceof BreakdownError) {
      return fail(err.message, 502, err.detail);
    }
    return handleRouteError(err);
  }
}
