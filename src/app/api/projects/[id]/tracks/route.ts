import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { createTrackSchema, firstZodError } from "@/server/validators";
import { createTrack, listTracks } from "@/server/services/track-service";
import type { TrackKind } from "@/lib/drama";

type Ctx = { params: Promise<{ id: string }> };

/** 轨道项列表（?kind=subtitle|sfx|bgm 过滤） */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const kind = req.nextUrl.searchParams.get("kind");
    return ok(await listTracks(id, (kind as TrackKind) || undefined));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** 手工追加轨道项（自动落轨之外的补充） */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = createTrackSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await createTrack(id, parsed.data), 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
