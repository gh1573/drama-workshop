import { NextRequest, NextResponse } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { startRun, listRuns } from "@/server/services/run-service";

type Ctx = { params: Promise<{ id: string }> };

/** 启动剧组流水线（编剧→选角→拆镜→锚定→后期） */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await startRun(id), 202);
  } catch (err) {
    return handleRouteError(err);
  }
}

/** 本项目的运行历史（最近 10 次） */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(
      { ok: true as const, data: await listRuns(id) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
