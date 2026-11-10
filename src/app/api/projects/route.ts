import { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api-utils";
import { saveProjectSchema, firstZodError } from "@/server/validators";
import { createProject, listProjects } from "@/server/services/project-service";

export async function GET() {
  try {
    return ok(await listProjects());
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = saveProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(firstZodError(parsed.error), 422);
    }
    return ok(await createProject(parsed.data), 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
