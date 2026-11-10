import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { updateProjectSchema, firstZodError } from "@/server/validators";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/server/services/project-service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await getProject(id));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = updateProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await updateProject(id, parsed.data));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteProject(id);
    return ok({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
