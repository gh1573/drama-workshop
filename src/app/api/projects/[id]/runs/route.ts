import { NextRequest, NextResponse } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { startRun, listRuns } from "@/server/services/run-service";

type Ctx = { params: Promise<{ id: string }> };

/** 启动剧组流水线（编剧→选角→拆镜→锚定→后期）；
 *  v2.9.6 剧本过稿开机：body 可选 keepScript=true——项目已有剧本且配置未变时，
 *  编剧阶段沿用已过目剧本不重写（传统剧组纪律：剧本定稿开机不重拍编剧） */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      keepScript?: boolean;
    };
    return ok(await startRun(id, { keepScript: body.keepScript === true }), 202);
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
