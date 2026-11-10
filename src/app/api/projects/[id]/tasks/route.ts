import { NextRequest, NextResponse } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { createTaskSchema, firstZodError } from "@/server/validators";
import { createTask, listTasks } from "@/server/services/task-service";
import type { TaskStatus } from "@/lib/drama";

type Ctx = { params: Promise<{ id: string }> };

/** 提交渲染任务（定妆照 / 镜头渲染；异步执行，轮询本接口看进度） */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = createTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await createTask(id, parsed.data), 202);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const status = req.nextUrl.searchParams.get("status");
    const tasks = await listTasks(
      id,
      status ? (status as TaskStatus) : undefined
    );
    return NextResponse.json(
      { ok: true as const, data: tasks },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
