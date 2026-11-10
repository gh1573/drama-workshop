import { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { retryTask } from "@/server/services/task-service";

type Ctx = { params: Promise<{ id: string }> };

/** 重试失败/已取消的任务（重置尝试计数后重新入队） */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await retryTask(id), 202);
  } catch (err) {
    return handleRouteError(err);
  }
}
