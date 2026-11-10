import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { updateClipSchema, firstZodError } from "@/server/validators";
import { deleteClip, updateClip } from "@/server/services/project-service";

type Ctx = { params: Promise<{ id: string }> };

/** 更新镜头片段（状态流转 / 改名 / 粘贴成片地址） */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = updateClipSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await updateClip(id, parsed.data));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteClip(id);
    return ok({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
