import path from "node:path";
import { promises as fs } from "node:fs";
import { db } from "@/lib/db";
import type { TaskKind } from "@/lib/drama";
import { getImageProvider, getVideoProvider, getVoiceProvider } from "@/server/providers";
import {
  DISPATCH_CONCURRENCY,
  DISPATCH_TICK_INTERVAL_MS,
  ORPHAN_RECOVERY_WINDOW_MS,
  VIDEO_INFLIGHT_LIMIT,
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_TIMEOUT_MS,
  VIDEO_SUBMIT_INTERVAL_MS,
} from "@/config/runtime";
import {
  PORTRAIT_SPECS,
  PORTRAIT_PROMPT_TAIL,
} from "@/config/templates";

/**
 * 进程内任务调度器 —— 外部生成通道（图像/视频）的统一执行载体。
 *
 * 语义（docs/architecture-v2.md §7.3）：
 * - 一切外部通道耗时操作都是 RenderTask：排队 → 执行 → 回写，前端只轮询 REST；
 * - 每类通道独立并发上限（防打爆通道）；失败自动重试至 maxAttempts；
 * - 视频通道为异步任务制：render() 返回 remoteTaskId 后转入轮询池，
 *   句柄落库、进程重启可恢复（幂等：恢复时先查旧句柄状态再决定是否重提交）；
 * - 轮询池不占执行并发槽 —— create/query 均为轻量调用，
 *   通道侧真实瓶颈由「在途上限」单独约束。
 *
 * 运行参数全部来自集中配置（§7.8）：并发上限、轮询间隔、回收窗口可经环境变量覆盖。
 *
 * 演进路径：多实例部署时把本文件替换为持久化队列（Redis/BullMQ），
 * handler 与 REST 契约不变。
 */

interface QueuedTask {
  id: string;
  kind: TaskKind;
  /** 恢复路径（进程重启回队）：不再消耗 attempts 额度 */
  resumed?: boolean;
}

/** 轮询池条目：异步通道在途任务 */
interface PollingEntry {
  taskId: string;
  kind: TaskKind;
  remoteTaskId: string;
  submittedAt: number;
  lastPolledAt: number;
}

interface DispatcherState {
  queue: QueuedTask[];
  running: Map<string, TaskKind>;
  /** 异步任务轮询池（key = taskId） */
  polling: Map<string, PollingEntry>;
  timer: ReturnType<typeof setTimeout> | null;
  pollTimer: ReturnType<typeof setTimeout> | null;
  recovered: boolean;
}

const g = globalThis as unknown as {
  __dramaDispatcher?: DispatcherState;
  /** 视频通道全局提交节流：上次 create 时间戳（进程级） */
  __dramaVideoSubmitAt?: number;
};

/** 视频提交节流：保证两次 create 之间的全局最小间隔（防批量撞 429） */
async function throttleVideoSubmit(): Promise<void> {
  for (;;) {
    const last = g.__dramaVideoSubmitAt ?? 0;
    const wait = last + VIDEO_SUBMIT_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      g.__dramaVideoSubmitAt = Date.now();
      return;
    }
    await new Promise((r) => setTimeout(r, Math.min(wait, 2_000)));
  }
}

function state(): DispatcherState {
  if (!g.__dramaDispatcher) {
    g.__dramaDispatcher = {
      queue: [],
      running: new Map(),
      polling: new Map(),
      timer: null,
      pollTimer: null,
      recovered: false,
    };
    void recoverOrphanTasks(g.__dramaDispatcher);
  }
  return g.__dramaDispatcher;
}

/** 进程重启恢复：
 *  - running 且有异步句柄 → 直接转回轮询池（幂等，不重复提交）；
 *  - running 且无句柄 → 回置 queued；
 *  - queued（进程死亡丢内存队列）→ 重新入队。
 *  只回收「过期」任务（回收窗口内无更新），防止 dev 多 worker 误回收执行中的任务 */
async function recoverOrphanTasks(s: DispatcherState) {
  if (s.recovered) return;
  s.recovered = true;
  try {
    const cutoff = new Date(Date.now() - ORPHAN_RECOVERY_WINDOW_MS);
    const running = await db.renderTask.findMany({
      where: { status: "running", updatedAt: { lt: cutoff } },
      select: { id: true, kind: true, remoteTaskId: true },
    });
    for (const o of running) {
      if (o.remoteTaskId) {
        s.polling.set(o.id, {
          taskId: o.id,
          kind: o.kind as TaskKind,
          remoteTaskId: o.remoteTaskId,
          submittedAt: Date.now(),
          lastPolledAt: 0,
        });
      } else {
        await db.renderTask.update({
          where: { id: o.id },
          data: { status: "queued" },
        });
        s.queue.push({ id: o.id, kind: o.kind as TaskKind, resumed: true });
      }
    }
    // 内存队列丢失的排队任务重新入队（幂等：重复入队由任务行状态与句柄检查兜底）
    const queued = await db.renderTask.findMany({
      where: { status: "queued", updatedAt: { lt: cutoff } },
      select: { id: true, kind: true },
    });
    for (const o of queued) {
      s.queue.push({ id: o.id, kind: o.kind as TaskKind, resumed: true });
    }
    if (running.length > 0 || queued.length > 0) {
      scheduleTick(s);
      schedulePoll(s);
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
  }, DISPATCH_TICK_INTERVAL_MS);
}

function schedulePoll(s: DispatcherState) {
  if (s.pollTimer) return;
  s.pollTimer = setTimeout(() => {
    s.pollTimer = null;
    void pollTick(s);
  }, DISPATCH_TICK_INTERVAL_MS);
}

/** 视频通道在途数（轮询池 + 执行中的 video） */
function videoInflight(s: DispatcherState): number {
  let n = s.polling.size;
  for (const kind of s.running.values()) if (kind === "video") n += 1;
  return n;
}

async function tick(s: DispatcherState): Promise<void> {
  // 按通道并发上限出队；video 额外受「在途上限」约束（通道侧并行生成数有限）。
  // 通道满时跳过该任务继续向后扫描（避免队头阻塞：video 满员不应堵住 portrait/voiceover）
  while (s.queue.length > 0) {
    const idx = s.queue.findIndex((next) => {
      const runningOfKind = [...s.running.values()].filter(
        (k) => k === next.kind
      ).length;
      if (runningOfKind >= DISPATCH_CONCURRENCY[next.kind]) return false;
      if (
        next.kind === "video" &&
        videoInflight(s) >= VIDEO_INFLIGHT_LIMIT
      )
        return false;
      return true;
    });
    if (idx === -1) break;
    const next = s.queue.splice(idx, 1)[0];
    console.log('[dispatcher] dispatch ' + next.kind + ' ' + next.id.slice(0, 8) + ' running=' + s.running.size);
    s.running.set(next.id, next.kind);
    void execute(next.id, next.kind, s, next.resumed === true);
  }
  if (s.queue.length > 0 || s.running.size > 0) scheduleTick(s);
}

/** 失败处置：未达重试上限回队尾，否则落 failed */
async function retryOrFail(
  s: DispatcherState,
  taskId: string,
  kind: TaskKind,
  message: string
): Promise<void> {
  const task = await db.renderTask.findUnique({ where: { id: taskId } });
  const attempts = task?.attempts ?? 1;
  const maxAttempts = task?.maxAttempts ?? 2;
  if (attempts < maxAttempts) {
    await db.renderTask
      .update({ where: { id: taskId }, data: { status: "queued", error: message } })
      .catch(() => undefined);
    s.queue.push({ id: taskId, kind });
    scheduleTick(s);
  } else {
    await db.renderTask
      .update({ where: { id: taskId }, data: { status: "failed", error: message } })
      .catch(() => undefined);
  }
}

async function execute(
  id: string,
  kind: TaskKind,
  s: DispatcherState,
  resumed = false
) {
  let polled = false; // 是否已转入轮询池（不占执行槽）
  try {
    const task = await db.renderTask.findUnique({ where: { id } });
    if (!task || task.status === "cancelled") return;

    await db.renderTask.update({
      where: { id },
      data: {
        status: "running",
        // 恢复路径不消耗 attempts（进程重启不应烧光重试额度）
        ...(resumed ? {} : { attempts: { increment: 1 } }),
      },
    });

    const payload = JSON.parse(task.payload) as Record<string, unknown>;
    const outcome = await HANDLERS[kind](task.id, task.projectId, payload);

    // 异步通道：转入轮询池，等待成片
    if (typeof outcome === "object" && outcome !== null && "remoteTaskId" in outcome) {
      s.polling.set(id, {
        taskId: id,
        kind,
        remoteTaskId: outcome.remoteTaskId,
        submittedAt: Date.now(),
        lastPolledAt: Date.now(),
      });
      polled = true;
      schedulePoll(s);
      return;
    }

    await db.renderTask.update({
      where: { id },
      data: { status: "succeeded", resultUrl: outcome, error: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    await retryOrFail(s, id, kind, message);
  } finally {
    s.running.delete(id);
    if (!polled) scheduleTick(s);
    else if (s.polling.size > 0) schedulePoll(s);
  }
}

/** 轮询池驱动：到期的在途任务逐个查询，直至终态或超时 */
async function pollTick(s: DispatcherState): Promise<void> {
  const now = Date.now();
  const due = [...s.polling.values()].filter(
    (e) => now - e.lastPolledAt >= VIDEO_POLL_INTERVAL_MS
  );
  for (const entry of due) {
    // 超时：句柄保留（重试时 handler 幂等续查，不浪费已生成的画幅）
    if (now - entry.submittedAt > VIDEO_POLL_TIMEOUT_MS) {
      s.polling.delete(entry.taskId);
      await retryOrFail(
        s,
        entry.taskId,
        entry.kind,
        `视频任务轮询超时（超过 ${Math.round(VIDEO_POLL_TIMEOUT_MS / 1000)}s 未出片）`
      );
      continue;
    }
    try {
      const taskRow = await db.renderTask.findUnique({
        where: { id: entry.taskId },
      });
      if (!taskRow || taskRow.status === "cancelled") {
        s.polling.delete(entry.taskId);
        continue;
      }
      const project = await db.project.findUnique({
        where: { id: taskRow.projectId },
      });
      const provider = getVideoProvider(project?.videoModel ?? "default");
      const result = await provider.poll(entry.remoteTaskId);
      entry.lastPolledAt = Date.now();
      if (result.status === "processing") continue;

      s.polling.delete(entry.taskId);
      if (result.status === "ready" && result.mediaUrl) {
        await settleVideoTask(entry.taskId, result.mediaUrl);
      } else {
        // 通道侧失败：清句柄后按重试策略回队（重试将重新提交）
        await db.renderTask
          .update({
            where: { id: entry.taskId },
            data: { remoteTaskId: null },
          })
          .catch(() => undefined);
        await retryOrFail(
          s,
          entry.taskId,
          entry.kind,
          result.reason ?? "视频通道渲染失败"
        );
      }
    } catch (err) {
      // 单个查询异常不拖垮整池：记录后等下一轮
      entry.lastPolledAt = Date.now();
      const message = err instanceof Error ? err.message : "轮询查询异常";
      await db.renderTask
        .update({ where: { id: entry.taskId }, data: { error: message } })
        .catch(() => undefined);
    }
  }
  if (s.polling.size > 0) schedulePoll(s);
}

/** 视频成片收尾：下载落盘（作品自包含，不受外链过期影响）→ 回写镜头 → 任务成功 */
async function settleVideoTask(taskId: string, remoteUrl: string): Promise<void> {
  const task = await db.renderTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const payload = JSON.parse(task.payload) as { clipId?: string };
  const clip = payload.clipId
    ? await db.timelineClip.findUnique({ where: { id: payload.clipId } })
    : null;

  const localUrl = await persistVideoFile(remoteUrl, payload.clipId ?? taskId);
  if (clip) {
    await db.timelineClip.update({
      where: { id: clip.id },
      data: {
        status: "ready",
        mediaUrl: localUrl,
        durationMs: clip.durationMs,
      },
    });
  }
  await db.renderTask.update({
    where: { id: taskId },
    data: { status: "succeeded", resultUrl: localUrl, error: null },
  });
}

/** 成片落盘：失败时兜底存远程地址（能力不回退） */
async function persistVideoFile(
  remoteUrl: string,
  key: string
): Promise<string> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) throw new Error("下载数据异常（<1KB）");
    const dir = path.join(process.cwd(), "public", "assets");
    await fs.mkdir(dir, { recursive: true });
    const file = `clip_${key}.mp4`;
    await fs.writeFile(path.join(dir, file), buf);
    return `/assets/${file}`;
  } catch {
    return remoteUrl;
  }
}

// ============================================================
// 通道处理器
// 成功 = 产物回写业务表并返回产物地址（string）；
// 异步通道 = 落库句柄并返回 { remoteTaskId }，由轮询池接管。
// ============================================================

type HandlerOutcome = string | { remoteTaskId: string };
type Handler = (
  taskId: string,
  projectId: string,
  payload: Record<string, unknown>
) => Promise<HandlerOutcome>;

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

    const spec = PORTRAIT_SPECS[asset.kind];

    const prompt = [
      spec.promptPrefix,
      asset.visualAnchor,
      project.tonePrompt,
      PORTRAIT_PROMPT_TAIL,
    ].join(", ");

    const image = await getImageProvider().generate({ prompt, size: spec.size });

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

  video: async (taskId, projectId, payload) => {
    const taskRow = await db.renderTask.findUnique({ where: { id: taskId } });
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

    const provider = getVideoProvider(project.videoModel);

    // 幂等恢复：上一次提交的句柄若仍在执行/已出片，直接接管，不重复提交
    // （poll 不受 create 节流限制，放在节流之前）
    const existingHandle = taskRow?.remoteTaskId;
    if (existingHandle) {
      const status = await provider.poll(existingHandle);
      if (status.status === "processing") {
        return { remoteTaskId: existingHandle };
      }
      if (status.status === "ready" && status.mediaUrl) {
        // 轮询池收尾逻辑复用：落盘 + 回写
        await settleVideoTask(taskId, status.mediaUrl);
        return status.mediaUrl;
      }
      // 旧句柄已失败：清句柄走重新提交
      await db.renderTask.update({
        where: { id: taskId },
        data: { remoteTaskId: null },
      });
    }

    // 全局提交节流：批量任务下 create 间隔不小于 VIDEO_SUBMIT_INTERVAL_MS
    await throttleVideoSubmit();

    const result = await provider.render({
      finalPrompt: clip.finalPrompt,
      subtitle: clip.subtitle,
      durationSeconds: project.durationSeconds,
      resolution: project.resolution,
      aspectRatio: project.aspectRatio,
    });

    if (result.mode === "async") {
      await db.renderTask.update({
        where: { id: taskId },
        data: { remoteTaskId: result.remoteTaskId },
      });
      return { remoteTaskId: result.remoteTaskId };
    }
    if (result.status === "failed") {
      throw new Error(result.reason ?? "视频通道渲染失败");
    }

    const localUrl = await persistVideoFile(result.mediaUrl ?? "", clip.id);
    await db.timelineClip.update({
      where: { id: clip.id },
      data: {
        status: "ready",
        mediaUrl: localUrl,
        durationMs: result.durationMs ?? clip.durationMs,
      },
    });
    return localUrl;
  },

  voiceover: async (_taskId, projectId, payload) => {
    const clipId = String(payload.clipId ?? "");
    const clip = await db.timelineClip.findUnique({ where: { id: clipId } });
    if (!clip || clip.projectId !== projectId) {
      throw new Error("镜头不存在或不属于该项目");
    }
    if (!clip.subtitle?.trim()) {
      throw new Error("镜头无台词字幕，无需配音");
    }

    // 角色声音画像：镜头绑定的主要角色资产（无则通道默认音色）
    const refs = await db.shotRef.findMany({
      where: { shotId: clip.id },
      select: { assetId: true },
    });
    const character = refs.length
      ? await db.asset.findFirst({
          where: { id: { in: refs.map((r) => r.assetId) }, kind: "character" },
          select: { voiceProfile: true },
        })
      : null;

    const audio = await getVoiceProvider().synthesize({
      text: clip.subtitle,
      voiceProfile: character?.voiceProfile ?? null,
    });

    const dir = path.join(process.cwd(), "public", "assets");
    await fs.mkdir(dir, { recursive: true });
    const file = `voice_${clip.id}.wav`;
    await fs.writeFile(
      path.join(dir, file),
      Buffer.from(audio.base64, "base64")
    );
    const url = `/assets/${file}`;

    // 配音轨落库：按镜头在时间轴上的起止对齐（§7.7 音轨对齐）
    const clips = await db.timelineClip.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: { id: true, plannedMs: true },
    });
    let cursor = 0;
    let startMs = 0;
    let endMs = 0;
    for (const c of clips) {
      const dur = c.plannedMs ?? 2000;
      if (c.id === clip.id) {
        startMs = cursor;
        endMs = cursor + dur;
        break;
      }
      cursor += dur;
    }

    // 同镜头旧配音轨替换（重跑配音 = 更新）
    await db.trackItem.deleteMany({
      where: { projectId, kind: "voiceover", clipId: clip.id },
    });
    await db.trackItem.create({
      data: {
        projectId,
        kind: "voiceover",
        clipId: clip.id,
        startMs,
        endMs,
        text: clip.subtitle,
        style: JSON.stringify({ url }),
      },
    });
    return url;
  },
};

const HANDLERS = handlers as Record<TaskKind, Handler>;

/** 入队（任务行已由 task-service 创建） */
export function enqueueTask(taskId: string, kind: TaskKind): void {
  const s = state();
  console.log(`[dispatcher] enqueue ${kind} ${taskId.slice(0, 8)} queue=${s.queue.length}`);
  s.queue.push({ id: taskId, kind });
  scheduleTick(s);
}

/**
 * 模块加载即初始化并恢复 —— 不依赖首个入队请求触发：
 * 进程重启后，DB 中残留的 queued/running 任务（含幂等 409 挡下的存量）
 * 会立即回到内存队列 / 轮询池，避免「孤儿任务无人接管」。
 */
void state();
