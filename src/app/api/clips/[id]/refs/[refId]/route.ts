import { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { unbindRef } from "@/server/services/asset-service";

type Ctx = { params: Promise<{ id: string; refId: string }> };

/** 解除镜头的资产引用 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { refId } = await ctx.params;
    await unbindRef(refId);
    return ok({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
