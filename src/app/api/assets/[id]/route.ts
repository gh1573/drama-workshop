import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { updateAssetSchema, firstZodError } from "@/server/validators";
import { deleteAsset, updateAsset } from "@/server/services/asset-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 更新资产。改动已被镜头锚定的 lockedAppearance / visualAnchor
 * 必须携带 confirmUnfreeze: true（服务端同步把绑定镜头标记「锚点过期」）。
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = updateAssetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    const { confirmUnfreeze, ...patch } = parsed.data;
    return ok(await updateAsset(id, patch, confirmUnfreeze ?? false));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteAsset(id);
    return ok({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
