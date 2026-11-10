import path from "node:path";
import { promises as fs } from "node:fs";
import { db } from "@/lib/db";
import type { TaskKind } from "@/lib/drama";
import { getImageProvider, getVideoProvider } from "@/server/providers";

/**
 * 进程内任务调度器 —— 外部生成通道（图像/视频）的统一执行载体。
 *
 * 语义（docs/architecture-v2.md §7.3）：
 * - 一切外部通道耗时操作都是 RenderTask：排队 → 执行 → 回写，前端只轮询 REST；
 * - 每类通道独立并发上限（防打爆通道）；失败自动重试至 maxAttempts；
 * - 进程重启恢复：残留 running 的任务回置 queued 重新调度。
 *
 * 演进路径：多实例部署时把本文件替换为持久化队列（Redis/BullMQ），
 * handler 与 REST 契约不变。
 */

const CONCURRENCY: Record<TaskKind, number> = {
  portrait: 2,
  video: 2,
  voiceover: 4,
};

interface QueuedTask {
  id: string;
  kind: TaskKind;
}

interface DispatcherState {
  queue: QueuedTask[];
  running: Map<string, TaskKind>;
  timer: ReturnType<typeof setTimeout> | null;
  recovered: boolean;
}

const g = globalThis as unknown as { __dramaDispatcher?: DispatcherState };

function state(): DispatcherState {
  if (!g.__dramaDispatcher) {
    g.__dramaDispatcher = {
      queue: [],
      running: new Map(),
      timer: null,
      recovered: false,
    };
    void recoverOrphanTasks(g.__dramaDispatcher);
  }
  return g.__dramaDispatcher;
}

/** 进程重启恢复：把残留 running 的任务回置 queued 并重新入队
 *  同 run-service：只回收「过期」任务（3 分钟无更新），防止 dev 多 worker 误回收执行中的任务 */
async function recoverOrphanTasks(s: DispatcherState) {
  if (s.recovered) return;
  s.recovered = true;
  try {
    const orphans = await db.renderTask.findMany({
      where: {
        status: "running",
        updatedAt: { lt: new Date(Date.now() - 3 * 60_000) },
      },
      select: { id: true, kind: true },
    });
    if (orphans.length > 0) {
      await db.renderTask.updateMany({
        where: { id: { in: orphans.map((o) => o.id) } },
        data: { status: "queued" },
      });
      for (const o of orphans) s.queue.push({ id: o.id, kind: o.kind as TaskKind });
      scheduleTick(s);
    }
  } catch {
    /* 数据库不可用时静默；下次入队会再触发 */
  }
}

function scheduleTick(s: DispatcherState) {
  if (s.timer) return;
  s.timer = setTimeout(() => {
    s.timer = null;
    void tick(s);
  }, 600);
}

async function tick(s: DispatcherState): Promise<void> {
  // 按通道并发上限出队
  while (s.queue.length > 0) {
    const next = s.queue[0];
    const runningOfKind = [...s.running.values()].filter(
      (k) => k === next.kind
    ).length;
    if (runningOfKind >= (CONCURRENCY[next.kind] ?? 2)) break;
    s.queue.shift();
    s.running.set(next.id, next.kind);
    void execute(next.id, next.kind, s);
  }
  if (s.queue.length > 0 || s.running.size > 0) scheduleTick(s);
}

async function execute(id: string, kind: TaskKind, s: DispatcherState) {
  try {
    const task = await db.renderTask.findUnique({ where: { id } });
    if (!task || task.status === "cancelled") return;

    await db.renderTask.update({
      where: { id },
      data: { status: "running", attempts: { increment: 1 } },
    });

    const payload = JSON.parse(task.payload) as Record<string, unknown>;
    const resultUrl = await HANDLERS[kind](task.id, task.projectId, payload);

    await db.renderTask.update({
      where: { id },
      data: { status: "succeeded", resultUrl, error: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    const task = await db.renderTask.findUnique({ where: { id } });
    const attempts = task?.attempts ?? 1;
    const maxAttempts = task?.maxAttempts ?? 2;
    if (attempts < maxAttempts) {
      // 重试：回到队尾
      await db.renderTask
        .update({ where: { id }, data: { status: "queued", error: message } })
        .catch(() => undefined);
      s.queue.push({ id, kind });
    } else {
      await db.renderTask
        .update({ where: { id }, data: { status: "failed", error: message } })
        .catch(() => undefined);
    }
  } finally {
    s.running.delete(id);
    scheduleTick(s);
  }
}

// ============================================================
// 通道处理器（成功 = 产物回写业务表并返回 resultUrl）
// ============================================================

type Handler = (
  taskId: string,
  projectId: string,
  payload: Record<string, unknown>
) => Promise<string>;

const handlers: Partial<Record<TaskKind, Handler>> = {
  portrait: async (_taskId, projectId, payload) => {
    const assetId = String(payload.assetId ?? "");
    const asset = await db.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.projectId !== projectId) {
      throw new Error("资产不存在或不属于该项目");
    }
    const project = await db.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("项目不存在");

    const size =
      asset.kind === "character"
        ? ("864x1152" as const) // 3:4 竖幅定妆
        : asset.kind === "scene"
          ? ("1344x768" as const) // 16:9 场景
          : ("1024x1024" as const); // 道具

    const prompt = [
      asset.kind === "character"
        ? "cinematic character portrait for a vertical short drama"
        : asset.kind === "scene"
          ? "cinematic establishing shot of a location for a short drama"
          : "product-style prop still for a short drama",
      asset.visualAnchor,
      project.tonePrompt,
      "dramatic lighting, highly detailed, consistent visual identity",
    ].join(", ");

    const image = await getImageProvider().generate({ prompt, size });

    const dir = path.join(process.cwd(), "public", "assets");
    await fs.mkdir(dir, { recursive: true });
    const file = `asset_${asset.id}.png`;
    await fs.writeFile(
      path.join(dir, file),
      Buffer.from(image.base64, "base64")
    );
    const url = `/assets/${file}`;
    await db.asset.update({
      where: { id: asset.id },
      data: { portraitUrl: url },
    });
    return url;
  },

  video: async (_taskId, projectId, payload) => {
    const clipId = String(payload.clipId ?? "");
    const clip = await db.timelineClip.findUnique({ where: { id: clipId } });
    if (!clip || clip.projectId !== projectId) {
      throw new Error("镜头不存在或不属于该项目");
    }
    const project = await db.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("项目不存在");
    if (!clip.finalPrompt) {
      throw new Error("镜头尚未完成锚定组装（无最终提示词），请先运行流水线或重新拆解");
    }

    const result = await getVideoProvider(project.videoModel).render({
      finalPrompt: clip.finalPrompt,
      subtitle: clip.subtitle,
      durationSeconds: project.durationSeconds,
      resolution: project.resolution,
      aspectRatio: project.aspectRatio,
    });

    if (result.status === "failed") {
      throw new Error(result.reason ?? "视频通道渲染失败");
    }
    await db.timelineClip.update({
      where: { id: clip.id },
      data: {
        status: "ready",
        mediaUrl: result.mediaUrl ?? null,
        durationMs: result.durationMs ?? clip.durationMs,
      },
    });
    return result.mediaUrl ?? "";
  },
};

const HANDLERS = handlers as Record<TaskKind, Handler>;

/** 入队（任务行已由 task-service 创建） */
export function enqueueTask(taskId: string, kind: TaskKind): void {
  const s = state();
  s.queue.push({ id: taskId, kind });
  scheduleTick(s);
}
