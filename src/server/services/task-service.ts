import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import type { TaskDTO, TaskKind, TaskStatus } from "@/lib/drama";
import { enqueueTask } from "@/server/tasks/dispatcher";
import { TASK_LIST_LIMIT } from "@/config/runtime";

/**
 * 任务服务 —— 渲染任务的提交 / 查询 / 重试 / 取消。
 * 任务行落库后交 dispatcher 执行；本服务不直接调用任何模型通道。
 */

function mapTask(row: {
  id: string;
  projectId: string;
  kind: string;
  status: string;
  payload: string;
  resultUrl: string | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskDTO {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind as TaskKind,
    status: row.status as TaskStatus,
    payload,
    resultUrl: row.resultUrl,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId } });
  if (!p) throw new RouteError("项目不存在或已被删除", 404);
  return p;
}

export async function createTask(
  projectId: string,
  input: { kind: TaskKind; assetId?: string; clipId?: string }
): Promise<TaskDTO> {
  await requireProject(projectId);

  if (input.kind === "voiceover") {
    if (!input.clipId) throw new RouteError("配音任务必须指定镜头 clipId", 422);
    const clip = await db.timelineClip.findUnique({ where: { id: input.clipId } });
    if (!clip || clip.projectId !== projectId) {
      throw new RouteError("镜头不存在或不属于该项目", 404);
    }
    if (!clip.subtitle?.trim()) {
      throw new RouteError("该镜头无台词字幕，无需配音", 422);
    }
  }
  if (input.kind === "portrait") {
    if (!input.assetId) throw new RouteError("定妆照任务必须指定资产 assetId", 422);
    const asset = await db.asset.findUnique({ where: { id: input.assetId } });
    if (!asset || asset.projectId !== projectId) {
      throw new RouteError("资产不存在或不属于该项目", 404);
    }
  }
  if (input.kind === "video") {
    if (!input.clipId) throw new RouteError("渲染任务必须指定镜头 clipId", 422);
    const clip = await db.timelineClip.findUnique({ where: { id: input.clipId } });
    if (!clip || clip.projectId !== projectId) {
      throw new RouteError("镜头不存在或不属于该项目", 404);
    }
    if (!clip.finalPrompt) {
      throw new RouteError("镜头尚未锚定（无最终提示词）：请先运行流水线或重新拆解该幕", 409);
    }
  }

  // 幂等去重：同一目标的活跃任务不重复提交
  const payload = JSON.stringify(
    input.kind === "portrait" ? { assetId: input.assetId } : { clipId: input.clipId }
  );
  const active = await db.renderTask.findFirst({
    where: {
      projectId,
      kind: input.kind,
      payload,
      status: { in: ["queued", "running"] },
    },
  });
  if (active) {
    throw new RouteError("该目标已有进行中的同类任务，请在任务中心查看进度", 409);
  }

  const row = await db.renderTask.create({
    data: { projectId, kind: input.kind, payload, status: "queued" },
  });
  enqueueTask(row.id, input.kind);
  return mapTask(row);
}

export async function listTasks(
  projectId: string,
  status?: TaskStatus
): Promise<TaskDTO[]> {
  const rows = await db.renderTask.findMany({
    where: { projectId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: TASK_LIST_LIMIT,
  });
  return rows.map(mapTask);
}

export async function getTask(taskId: string): Promise<TaskDTO> {
  const row = await db.renderTask.findUnique({ where: { id: taskId } });
  if (!row) throw new RouteError("任务不存在", 404);
  return mapTask(row);
}

/** 重试：失败/已取消的任务重置计数后重新入队 */
export async function retryTask(taskId: string): Promise<TaskDTO> {
  const row = await db.renderTask.findUnique({ where: { id: taskId } });
  if (!row) throw new RouteError("任务不存在", 404);
  if (row.status === "queued" || row.status === "running") {
    throw new RouteError("任务仍在执行中，无需重试", 409);
  }
  const active = await db.renderTask.findFirst({
    where: {
      projectId: row.projectId,
      kind: row.kind,
      payload: row.payload,
      status: { in: ["queued", "running"] },
    },
  });
  if (active && active.id !== row.id) {
    throw new RouteError("该目标已有进行中的同类任务", 409);
  }
  const updated = await db.renderTask.update({
    where: { id: taskId },
    data: { status: "queued", attempts: 0, error: null, resultUrl: null },
  });
  enqueueTask(updated.id, updated.kind as TaskKind);
  return mapTask(updated);
}

/** 取消（仅排队中可取消；执行中的任务走失败重试语义） */
export async function cancelTask(taskId: string): Promise<TaskDTO> {
  const row = await db.renderTask.findUnique({ where: { id: taskId } });
  if (!row) throw new RouteError("任务不存在", 404);
  if (row.status !== "queued") {
    throw new RouteError("仅排队中的任务可以取消", 409);
  }
  const updated = await db.renderTask.update({
    where: { id: taskId },
    data: { status: "cancelled" },
  });
  return mapTask(updated);
}
