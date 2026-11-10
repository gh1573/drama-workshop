import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { updateTrackSchema, firstZodError } from "@/server/validators";
import { deleteTrack, updateTrack } from "@/server/services/track-service";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = updateTrackSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await updateTrack(id, parsed.data));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteTrack(id);
    return ok({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
