import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ok, handleRouteError } from "@/lib/api-utils";
import type { TaskStatus } from "@/lib/drama";
import { listTasks } from "@/server/services/task-service";

/**
 * 任务列表（前端轮询端点，docs/architecture-v2.md §8）：
 * 按项目过滤 + 可选状态过滤，no-store 保证轮询实时性。
 */
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
    const status = req.nextUrl.searchParams.get("status") as TaskStatus | null;
    if (!projectId) {
      return NextResponse.json(
        { ok: false as const, error: "缺少 projectId 查询参数" },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }
    const data = await listTasks(projectId, status ?? undefined);
    return NextResponse.json(
      { ok: true as const, data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
