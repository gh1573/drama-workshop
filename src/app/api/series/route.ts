import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { createSeriesSchema, firstZodError } from "@/server/validators";
import { createSeries, listSeries } from "@/server/services/series-service";

/** 系列列表 / 创建（v2.3 多剧集连载容器） */
export async function GET() {
  try {
    return ok(await listSeries());
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = createSeriesSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await createSeries(parsed.data));
  } catch (err) {
    return handleRouteError(err);
  }
}
