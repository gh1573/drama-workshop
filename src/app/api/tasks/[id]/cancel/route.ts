import { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { cancelTask } from "@/server/services/task-service";

type Ctx = { params: Promise<{ id: string }> };

/** 取消任务（仅排队中可取消） */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await cancelTask(id));
  } catch (err) {
    return handleRouteError(err);
  }
}
