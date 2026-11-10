import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { createAssetSchema, firstZodError } from "@/server/validators";
import { createAsset, listAssets } from "@/server/services/asset-service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await listAssets(id));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** 手工建立资产（剧组流水线选角阶段也会自动建库，二者共存） */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = createAssetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await createAsset(id, parsed.data), 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
