import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, ok } from "@/lib/api-utils";
import { renderAllTasks } from "@/server/services/task-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 一键渲染全片（v2.4 §7.9）：批量提交 video + voiceover 任务（幂等去重）。
 * 返回 202 Accepted；进度经任务列表轮询观测。
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await renderAllTasks(id), 202);
  } catch (err) {
    return handleRouteError(err);
  }
}
