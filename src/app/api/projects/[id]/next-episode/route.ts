import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { nextEpisodeSchema, firstZodError } from "@/server/validators";
import { continueWithNextEpisode } from "@/server/services/series-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 一键续写下一集（v2.9 连载产品化）。
 *
 * 产品语义：当前集是独立项目时自动升级为系列第 1 集，再追加第 N+1 集；
 * 题材/模型参数缺省继承上一集；资产库默认克隆（定妆图沿用，跨集同一张脸）。
 * 返回新集全量详情 + 继承元数据，前端直接切会话续产。
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = nextEpisodeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await continueWithNextEpisode(id, parsed.data));
  } catch (err) {
    return handleRouteError(err);
  }
}
