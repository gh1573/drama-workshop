import { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { retryRun } from "@/server/services/run-service";

type Ctx = { params: Promise<{ id: string }> };

/** 断点续跑：从首个未成功阶段继续（已成功阶段幂等保留） */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await retryRun(id), 202);
  } catch (err) {
    return handleRouteError(err);
  }
}
