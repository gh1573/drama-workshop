import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { createClipSchema, reorderClipsSchema, firstZodError } from "@/server/validators";
import { createClip, reorderClips } from "@/server/services/project-service";

type Ctx = { params: Promise<{ id: string }> };

/** 新增镜头片段（追加到时间轨末尾，项目自动转为「制作中」） */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = createClipSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await createClip(id, parsed.data), 201);
  } catch (err) {
    return handleRouteError(err);
  }
}

/** 时间轨整体重排序（传入全量 clipIds 的目标顺序） */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parsed = reorderClipsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    await reorderClips(id, parsed.data.clipIds);
    return ok({ reordered: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
