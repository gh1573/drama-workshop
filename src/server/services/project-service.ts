import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import {
  CLIP_STATUS,
  toExportData,
  type ClipData,
  type ClipStatus,
  type DramaProjectData,
  type ModelConfig,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectSummary,
  type SaveProjectPayload,
  type ShotBreakdownItem,
  type StoryBeat,
} from "@/lib/drama";
import type { Prisma, TimelineClip, StoryBeat as DbBeat } from "@prisma/client";

/**
 * 项目服务层 —— 工作台全部业务逻辑的唯一入口。
 * API 路由只做入参校验与调用；前端只消费返回的 DTO。
 * 后续扩容（视频生成队列、多人协作、版本快照）都在此层演进。
 */

const PROJECT_INCLUDE = {
  beats: { orderBy: { index: "asc" as const } },
  clips: { orderBy: { order: "asc" as const } },
};

type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

function mapBeat(b: DbBeat): StoryBeat {
  return {
    index: b.index,
    actTitle: b.actTitle,
    narrativeFunction: b.narrativeFunction as StoryBeat["narrativeFunction"],
    pacingNote: b.pacingNote,
    description: b.description,
    dialogueSubtitle: b.dialogueSubtitle,
    cameraMovement: b.cameraMovement,
    promptGuidance: b.promptGuidance,
  };
}

function mapClip(c: TimelineClip): ClipData {
  return {
    id: c.id,
    beatIndex: c.beatIndex,
    order: c.order,
    name: c.name,
    subtitle: c.subtitle,
    format: c.format,
    status: c.status as ClipStatus,
    mediaUrl: c.mediaUrl,
    durationMs: c.durationMs,
    shotSize: c.shotSize,
    cameraMovement: c.cameraMovement,
    visualDesc: c.visualDesc,
    plannedMs: c.plannedMs,
  };
}

function mapProject(p: ProjectWithRelations): ProjectDetail {
  return {
    id: p.id,
    title: p.title,
    status: p.status as ProjectStatus,
    schemaVersion: p.schemaVersion,
    genreId: p.genreId,
    genre: {
      id: p.genreId,
      name: p.genreName,
      badge: p.genreBadge,
      hookTactic: p.hookTactic,
      musicMood: p.musicMood,
      tonePrompt: p.tonePrompt,
    },
    aspectRatio: p.aspectRatio,
    synopsis: p.synopsis,
    modelConfig: {
      videoModel: p.videoModel,
      durationSeconds: p.durationSeconds,
      resolution: p.resolution,
      scriptThinkingLevel: p.thinkingLevel as ModelConfig["scriptThinkingLevel"],
      enablePromptEnhance: p.promptEnhance,
    },
    storyBeats: p.beats.map(mapBeat),
    timelineClips: p.clips.map(mapClip),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    beatCount: p.beats.length,
    clipCount: p.clips.length,
    genreBadge: p.genreBadge,
    genreName: p.genreName,
  };
}

async function requireProject(id: string): Promise<ProjectWithRelations> {
  const p = await db.project.findUnique({ where: { id }, include: PROJECT_INCLUDE });
  if (!p) throw new RouteError("项目不存在或已被删除", 404);
  return p;
}

function defaultTitle(genreName: string, synopsis: string): string {
  const head = synopsis.trim().replace(/\s+/g, "").slice(0, 10);
  return `${genreName} · ${head}${synopsis.trim().length > 10 ? "…" : ""}`;
}

/** —— 项目 CRUD —— */

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await db.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { beats: true, clips: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as ProjectStatus,
    genreId: r.genreId,
    genreName: r.genreName,
    genreBadge: r.genreBadge,
    beatCount: r._count.beats,
    clipCount: r._count.clips,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createProject(payload: SaveProjectPayload): Promise<ProjectDetail> {
  const p = await db.project.create({
    data: {
      title: payload.title?.trim() || defaultTitle(payload.genre.name, payload.synopsis),
      status: payload.status ?? "beatsReady",
      genreId: payload.genre.id,
      genreName: payload.genre.name,
      genreBadge: payload.genre.badge,
      hookTactic: payload.genre.hookTactic,
      musicMood: payload.genre.musicMood,
      tonePrompt: payload.genre.tonePrompt,
      aspectRatio: "9:16",
      synopsis: payload.synopsis.trim(),
      videoModel: payload.modelConfig.videoModel,
      durationSeconds: payload.modelConfig.durationSeconds,
      resolution: payload.modelConfig.resolution,
      thinkingLevel: payload.modelConfig.scriptThinkingLevel,
      promptEnhance: payload.modelConfig.enablePromptEnhance,
      beats: {
        create: payload.storyBeats.map((b) => ({
          index: b.index,
          actTitle: b.actTitle,
          narrativeFunction: b.narrativeFunction,
          pacingNote: b.pacingNote,
          description: b.description,
          dialogueSubtitle: b.dialogueSubtitle,
          cameraMovement: b.cameraMovement,
          promptGuidance: b.promptGuidance,
        })),
      },
    },
    include: PROJECT_INCLUDE,
  });
  return mapProject(p);
}

export async function getProject(id: string): Promise<ProjectDetail> {
  return mapProject(await requireProject(id));
}

export async function updateProject(
  id: string,
  patch: {
    title?: string;
    synopsis?: string;
    status?: ProjectStatus;
    modelConfig?: ModelConfig;
    storyBeats?: StoryBeat[];
  }
): Promise<ProjectDetail> {
  await requireProject(id);
  const data: Prisma.ProjectUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.synopsis !== undefined) data.synopsis = patch.synopsis.trim();
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.modelConfig) {
    data.videoModel = patch.modelConfig.videoModel;
    data.durationSeconds = patch.modelConfig.durationSeconds;
    data.resolution = patch.modelConfig.resolution;
    data.thinkingLevel = patch.modelConfig.scriptThinkingLevel;
    data.promptEnhance = patch.modelConfig.enablePromptEnhance;
  }

  // 分镜整体替换（事务保证原子性）；既有镜头轨的 beatIndex 引用可能失效，
  // 一并钳制到 1~3 有效范围内，避免悬挂引用
  if (patch.storyBeats) {
    await db.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: { ...data, beats: { deleteMany: {} } },
      });
      await tx.storyBeat.createMany({
        data: patch.storyBeats!.map((b) => ({
          projectId: id,
          index: b.index,
          actTitle: b.actTitle,
          narrativeFunction: b.narrativeFunction,
          pacingNote: b.pacingNote,
          description: b.description,
          dialogueSubtitle: b.dialogueSubtitle,
          cameraMovement: b.cameraMovement,
          promptGuidance: b.promptGuidance,
        })),
      });
      const validIndexes = patch.storyBeats!.map((b) => b.index);
      await tx.timelineClip.updateMany({
        where: { projectId: id, beatIndex: { notIn: validIndexes } },
        data: { beatIndex: validIndexes[0] },
      });
    });
    return mapProject(await requireProject(id));
  }

  const p = await db.project.update({ where: { id }, data, include: PROJECT_INCLUDE });
  return mapProject(p);
}

export async function deleteProject(id: string): Promise<void> {
  await requireProject(id);
  await db.project.delete({ where: { id } });
}

/** —— 镜头轨管理 —— */

/**
 * 分镜拆解回写：用 AI 拆解出的镜头组替换指定幕的全部片段。
 * 事务内：删旧 → 按幕分组重排插入新镜头 → 重写全局 order，
 * 保证镜头轨按幕分段、段内按拆解顺序。
 */
export async function replaceActClips(
  projectId: string,
  beatIndex: number,
  shots: Array<ShotBreakdownItem>
): Promise<ClipData[]> {
  const project = await requireProject(projectId);
  const beat = project.beats.find((b) => b.index === beatIndex);
  if (!beat) throw new RouteError(`第 ${beatIndex} 幕不存在，无法拆解`, 400);
  const locked = project.clips.filter(
    (c) => c.beatIndex === beatIndex && c.status === "ready"
  );
  if (locked.length > 0) {
    throw new RouteError(
      `该幕已有 ${locked.length} 个已生成的镜头，请先重置为待生成后再重新拆解`,
      409
    );
  }

  await db.$transaction(async (tx) => {
    await tx.timelineClip.deleteMany({
      where: { projectId, beatIndex },
    });
    // 按幕分组重排：保留其他幕片段的相对顺序，新镜头替换该幕段
    const rest = project.clips
      .filter((c) => c.beatIndex !== beatIndex)
      .sort((a, b) => a.order - b.order);
    const ordered: Array<{
      clip: (typeof rest)[number] | null;
      shot: ShotBreakdownItem | null;
    }> = rest.map((c) => ({ clip: c, shot: null }));
    const insertAt = (() => {
      const idx = ordered.findIndex(
        (o) => o.clip && o.clip.beatIndex > beatIndex
      );
      return idx === -1 ? ordered.length : idx;
    })();
    ordered.splice(
      insertAt,
      0,
      ...shots.map((s) => ({ clip: null, shot: s }))
    );
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      if (item.shot) {
        await tx.timelineClip.create({
          data: {
            projectId,
            beatIndex,
            order: i,
            name: item.shot.name,
            subtitle: item.shot.subtitle ?? "",
            format: "mp4",
            status: "pending",
            shotSize: item.shot.shotSize,
            cameraMovement: item.shot.cameraMovement,
            visualDesc: item.shot.visualDesc,
            plannedMs: item.shot.plannedMs,
          },
        });
      } else if (item.clip && item.clip.order !== i) {
        await tx.timelineClip.update({
          where: { id: item.clip.id },
          data: { order: i },
        });
      }
    }
    await tx.project.update({
      where: { id: projectId },
      data: { status: "inProduction" },
    });
  });

  const fresh = await requireProject(projectId);
  return fresh.clips
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(mapClip);
}

export async function createClip(
  projectId: string,
  input: { beatIndex: number; name: string; subtitle: string; format: string }
): Promise<ClipData> {
  const project = await requireProject(projectId);
  const beatExists = project.beats.some((b) => b.index === input.beatIndex);
  if (!beatExists) throw new RouteError(`关联的第 ${input.beatIndex} 幕不存在`, 400);

  const maxOrder = project.clips.reduce((m, c) => Math.max(m, c.order), -1);
  const clip = await db.timelineClip.create({
    data: {
      projectId,
      beatIndex: input.beatIndex,
      order: maxOrder + 1,
      name: input.name,
      subtitle: input.subtitle,
      format: input.format,
      status: "pending",
    },
  });
  await db.project.update({
    where: { id: projectId },
    data: { status: "inProduction" },
  });
  return mapClip(clip);
}

export async function updateClip(
  clipId: string,
  patch: {
    name?: string;
    subtitle?: string;
    format?: string;
    status?: ClipStatus;
    mediaUrl?: string | null;
    durationMs?: number | null;
    cameraMovement?: string | null;
    plannedMs?: number | null;
  }
): Promise<ClipData> {
  const existing = await db.timelineClip.findUnique({ where: { id: clipId } });
  if (!existing) throw new RouteError("镜头片段不存在或已被删除", 404);
  if (patch.status && !(patch.status in CLIP_STATUS)) {
    throw new RouteError("非法的镜头状态", 400);
  }
  const clip = await db.timelineClip.update({ where: { id: clipId }, data: patch });
  return mapClip(clip);
}

export async function deleteClip(clipId: string): Promise<void> {
  const existing = await db.timelineClip.findUnique({ where: { id: clipId } });
  if (!existing) throw new RouteError("镜头片段不存在或已被删除", 404);
  await db.$transaction(async (tx) => {
    await tx.timelineClip.delete({ where: { id: clipId } });
    // 删除后紧凑重排，保证 order 连续
    const rest = await tx.timelineClip.findMany({
      where: { projectId: existing.projectId },
      orderBy: { order: "asc" },
    });
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].order !== i) {
        await tx.timelineClip.update({ where: { id: rest[i].id }, data: { order: i } });
      }
    }
  });
}

export async function reorderClips(projectId: string, clipIds: string[]): Promise<void> {
  const project = await requireProject(projectId);
  const owned = new Set(project.clips.map((c) => c.id));
  if (clipIds.length !== project.clips.length || !clipIds.every((id) => owned.has(id))) {
    throw new RouteError("排序数据与镜头轨不一致，请刷新后重试", 400);
  }
  await db.$transaction(
    clipIds.map((id, i) =>
      db.timelineClip.update({ where: { id }, data: { order: i } })
    )
  );
}

/** —— 导出（与原版 schema 对齐） —— */

export async function exportProject(id: string): Promise<DramaProjectData> {
  return toExportData(await getProject(id));
}
