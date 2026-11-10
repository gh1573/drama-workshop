import { NextRequest, NextResponse } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { getRun } from "@/server/services/run-service";

type Ctx = { params: Promise<{ id: string }> };

/** 流水线运行详情（前端轮询端点：阶段状态 + 进度 + 剧组日志） */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const data = await getRun(id);
    return NextResponse.json(
      { ok: true as const, data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
