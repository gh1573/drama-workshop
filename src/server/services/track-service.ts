import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import type { EnergyCurvePoint, TrackItemDTO, TrackKind } from "@/lib/drama";

/**
 * 轨道服务 —— 字幕 / 音效 / 配乐三轨 + 情绪能量曲线。
 *
 * 产品语义：后期阶段的「确定性落轨」—— 不再靠人工对时间轴，
 * 拆镜产物（subtitle / sfxHint / 场次级能量）自动换算为时间轴轨道项；
 * 人工仍可增删改（三轨是数据，不是只读视图）。
 */

const KINDS: TrackKind[] = ["subtitle", "sfx", "bgm", "voiceover"];

interface ClipRow {
  id: string;
  order: number;
  beatIndex: number;
  subtitle: string;
  sfxHint: string | null;
  plannedMs: number | null;
}

interface BeatRow {
  index: number;
  dialogueSubtitle: string;
  energyStart: number | null;
  energyEnd: number | null;
}

function mapTrack(row: {
  id: string;
  kind: string;
  clipId: string | null;
  startMs: number;
  endMs: number;
  text: string;
  style: string | null;
}): TrackItemDTO {
  return {
    id: row.id,
    kind: row.kind as TrackKind,
    clipId: row.clipId,
    startMs: row.startMs,
    endMs: row.endMs,
    text: row.text,
    style: row.style ? safeParse(row.style) : null,
  };
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function listTracks(
  projectId: string,
  kind?: TrackKind
): Promise<TrackItemDTO[]> {
  const rows = await db.trackItem.findMany({
    where: { projectId, ...(kind ? { kind } : {}) },
    orderBy: { startMs: "asc" },
  });
  return rows.map(mapTrack);
}

export async function createTrack(
  projectId: string,
  input: {
    kind: TrackKind;
    clipId?: string | null;
    startMs: number;
    endMs: number;
    text: string;
    style?: Record<string, unknown> | null;
  }
): Promise<TrackItemDTO> {
  if (!KINDS.includes(input.kind)) {
    throw new RouteError("轨道类型必须是 subtitle / sfx / bgm / voiceover", 422);
  }
  if (input.endMs <= input.startMs) {
    throw new RouteError("轨道项出点必须晚于入点", 422);
  }
  const row = await db.trackItem.create({
    data: {
      projectId,
      kind: input.kind,
      clipId: input.clipId ?? null,
      startMs: input.startMs,
      endMs: input.endMs,
      text: input.text.trim(),
      style: input.style ? JSON.stringify(input.style) : null,
    },
  });
  return mapTrack(row);
}

export async function updateTrack(
  trackId: string,
  patch: {
    startMs?: number;
    endMs?: number;
    text?: string;
    style?: Record<string, unknown> | null;
  }
): Promise<TrackItemDTO> {
  const exists = await db.trackItem.findUnique({ where: { id: trackId } });
  if (!exists) throw new RouteError("轨道项不存在", 404);
  const row = await db.trackItem.update({
    where: { id: trackId },
    data: {
      ...(patch.startMs !== undefined ? { startMs: patch.startMs } : {}),
      ...(patch.endMs !== undefined ? { endMs: patch.endMs } : {}),
      ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
      ...(patch.style !== undefined
        ? { style: patch.style ? JSON.stringify(patch.style) : null }
        : {}),
    },
  });
  return mapTrack(row);
}

export async function deleteTrack(trackId: string): Promise<void> {
  const exists = await db.trackItem.findUnique({ where: { id: trackId } });
  if (!exists) throw new RouteError("轨道项不存在", 404);
  await db.trackItem.delete({ where: { id: trackId } });
}

/**
 * 确定性落轨（后期阶段核心，幂等）：
 * - 时间轴：按镜头轨 order 累计 plannedMs（缺省 2000ms/镜）；
 * - 字幕轨：有台词的镜头逐条落轨；金句镜头（含本场 dialogueSubtitle）
 *   标记大字样式（scale xl + 居中）；
 * - 音效轨：sfxHint 非空的镜头在入点卡点（时长 600ms 封顶）；
 * - 配乐轨：按场次分段，情绪标签取题材配乐，强度取场尾能量。
 */
export async function rebuildTracks(projectId: string): Promise<TrackItemDTO[]> {
  const [project, clips, beats] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: { musicMood: true },
    }),
    db.timelineClip.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    }),
    db.storyBeat.findMany({ where: { projectId } }),
  ]);
  if (!project) throw new RouteError("项目不存在或已被删除", 404);

  const beatByIndex = new Map<number, BeatRow>(
    beats.map((b) => [
      b.index,
      {
        index: b.index,
        dialogueSubtitle: b.dialogueSubtitle,
        energyStart: b.energyStart,
        energyEnd: b.energyEnd,
      },
    ])
  );

  await db.$transaction([
    // 配音轨（voiceover）是渲染任务产物，不参与三轨自动重建
    db.trackItem.deleteMany({ where: { projectId, kind: { in: ["subtitle", "sfx", "bgm"] } } }),
  ]);

  // —— 时间轴推算 ——
  let cursor = 0;
  const timeline: Array<ClipRow & { startMs: number; endMs: number }> = [];
  for (const c of clips) {
    const dur = c.plannedMs ?? 2000;
    timeline.push({
      id: c.id,
      order: c.order,
      beatIndex: c.beatIndex,
      subtitle: c.subtitle,
      sfxHint: c.sfxHint,
      plannedMs: c.plannedMs,
      startMs: cursor,
      endMs: cursor + dur,
    });
    cursor += dur;
  }

  const creates: Array<{
    projectId: string;
    kind: TrackKind;
    clipId: string | null;
    startMs: number;
    endMs: number;
    text: string;
    style: string | null;
  }> = [];

  // —— 字幕轨 / 音效轨 ——
  for (const t of timeline) {
    if (t.subtitle.trim()) {
      const beat = beatByIndex.get(t.beatIndex);
      const isGolden =
        !!beat &&
        !!beat.dialogueSubtitle &&
        (t.subtitle.includes(beat.dialogueSubtitle) ||
          beat.dialogueSubtitle.includes(t.subtitle));
      creates.push({
        projectId,
        kind: "subtitle",
        clipId: t.id,
        startMs: t.startMs,
        endMs: t.endMs,
        text: t.subtitle,
        style: JSON.stringify(
          isGolden
            ? { scale: "xl", position: "center", golden: true }
            : { scale: "md", position: "bottom" }
        ),
      });
    }
    if (t.sfxHint?.trim()) {
      creates.push({
        projectId,
        kind: "sfx",
        clipId: t.id,
        startMs: t.startMs,
        endMs: Math.min(t.startMs + 600, t.endMs),
        text: t.sfxHint.trim(),
        style: null,
      });
    }
  }

  // —— 配乐轨（按场次分段） ——
  for (const beat of beatByIndex.values()) {
    const group = timeline.filter((t) => t.beatIndex === beat.index);
    if (group.length === 0) continue;
    const startMs = group[0].startMs;
    const endMs = group[group.length - 1].endMs;
    creates.push({
      projectId,
      kind: "bgm",
      clipId: null,
      startMs,
      endMs,
      text: project.musicMood,
      style: JSON.stringify({
        intensity: Math.round((beat.energyEnd ?? 70)) / 100,
        moodStart: beat.energyStart ?? null,
        moodEnd: beat.energyEnd ?? null,
      }),
    });
  }

  if (creates.length > 0) {
    await db.trackItem.createMany({ data: creates });
  }
  return listTracks(projectId);
}

/** 情绪能量曲线：按镜头轨顺序输出能量点（未标的镜头以 50 兜底） */
export async function getEnergyCurve(
  projectId: string
): Promise<EnergyCurvePoint[]> {
  const clips = await db.timelineClip.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    select: { id: true, order: true, beatIndex: true, energy: true },
  });
  return clips.map((c, i) => ({
    clipId: c.id,
    order: c.order ?? i,
    beatIndex: c.beatIndex,
    energy: c.energy ?? 50,
  }));
}
