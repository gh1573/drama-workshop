import { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { getEnergyCurve } from "@/server/services/track-service";

type Ctx = { params: Promise<{ id: string }> };

/** 情绪能量曲线（按镜头轨顺序的能量点集，节奏预警数据源） */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await getEnergyCurve(id));
  } catch (err) {
    return handleRouteError(err);
  }
}
