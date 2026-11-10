import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { bindRefSchema, firstZodError } from "@/server/validators";
import { bindRef } from "@/server/services/asset-service";

type Ctx = { params: Promise<{ id: string }> };

/** 镜头绑定资产（一致性锚定的引用关系） */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = bindRefSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(
      await bindRef(id, parsed.data.assetId, parsed.data.stateNote ?? null),
      201
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
