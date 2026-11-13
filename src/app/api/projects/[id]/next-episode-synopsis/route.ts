import { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { draftNextEpisodeSynopsis } from "@/server/services/series-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * AI 接钩子（v2.9.5 连载降门槛）：编剧室按本集剧本（尤其卡点留钩场）
 * 与题材战术手册起草下一集承接梗概。文本通道调用，零视频配额。
 * 返回 { synopsis }——弹窗内可改后创建，AI 只降门槛不代笔。
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok({ synopsis: await draftNextEpisodeSynopsis(id) });
  } catch (err) {
    return handleRouteError(err);
  }
}
