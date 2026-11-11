import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, ok } from "@/lib/api-utils";
import { composeEpisode } from "@/server/services/compose-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 成片合成（v2.4 §7.9）：全部镜头就绪后 ffmpeg 合成整集
 * （片头卡 + 字幕烧录 + 配音混音），产物回写 Project.finalVideoUrl。
 * 同步执行（数十秒量级）；缺片 409 返回缺失清单。
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await composeEpisode(id));
  } catch (err) {
    return handleRouteError(err);
  }
}
