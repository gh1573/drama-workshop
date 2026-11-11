import { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import { exportProject } from "@/server/services/project-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 导出制作包 JSON（与 v1.2.0 schema 对齐 + v2 可选扩展段：
 * assets / tracks / energyCurve / 镜头级 finalPrompt）。
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await exportProject(id));
  } catch (err) {
    return handleRouteError(err);
  }
}
