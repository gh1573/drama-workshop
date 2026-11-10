import { NextRequest, NextResponse } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { getTask } from "@/server/services/task-service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const data = await getTask(id);
    return NextResponse.json(
      { ok: true as const, data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
