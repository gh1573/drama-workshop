import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { batchRenderSchema, firstZodError } from "@/server/validators";
import { batchRenderSeries } from "@/server/services/series-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 系列级批量提交（C11）：
 * kind=video 渲染全系列待拍镜头；kind=portrait 补全全系列缺失定妆图。
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = batchRenderSchema.safeParse(
      await req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await batchRenderSeries(id, parsed.data.kind));
  } catch (err) {
    return handleRouteError(err);
  }
}
