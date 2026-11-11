import { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { getSeriesDetail } from "@/server/services/series-service";

type Ctx = { params: Promise<{ id: string }> };

/** 系列详情（含剧集列表与各集时长/镜头汇总） */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await getSeriesDetail(id));
  } catch (err) {
    return handleRouteError(err);
  }
}
