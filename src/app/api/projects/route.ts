import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { createDraftSchema, firstZodError } from "@/server/validators";
import { createProjectDraft, listProjects } from "@/server/services/project-service";

export async function GET() {
  try {
    return ok(await listProjects());
  } catch (err) {
    return handleRouteError(err);
  }
}

/** 立项草稿：只落题材快照与工程参数，随后由 POST /runs 启动剧组流水线 */
export async function POST(req: NextRequest) {
  try {
    const parsed = createDraftSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await createProjectDraft(parsed.data), 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
