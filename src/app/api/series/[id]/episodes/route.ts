import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { createEpisodeSchema, firstZodError } from "@/server/validators";
import { addEpisode } from "@/server/services/series-service";

type Ctx = { params: Promise<{ id: string }> };

/** 新建剧集：追加为系列第 N+1 集（题材/模型参数缺省继承，可选克隆上一集资产库） */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = createEpisodeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await addEpisode(id, parsed.data));
  } catch (err) {
    return handleRouteError(err);
  }
}
