import { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { anchorProjectClips } from "@/server/services/run-service";

type Ctx = { params: Promise<{ id: string }> };

/** 重新锚定：对全部非人工微调镜头重跑组装管线（锚点解冻后的恢复入口） */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await anchorProjectClips(id));
  } catch (err) {
    return handleRouteError(err);
  }
}
