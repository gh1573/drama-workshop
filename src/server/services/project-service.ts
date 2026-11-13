import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import {
  CLIP_STATUS,
  toExportData,
  type ClipData,
  type ClipStatus,
  type CreateProjectDraftPayload,
  type DramaProjectData,
  type ModelConfig,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectSummary,
  type ShotBreakdownItem,
  type StoryBeat,
} from "@/lib/drama";
import type { Prisma, TimelineClip, StoryBeat as DbBeat } from "@prisma/client";
import { computeStaleClipIds, listAssets, listRefs } from "./asset-service";
import { listTracks } from "./track-service";
import { getLatestRun } from "./run-service";

/**
 * 项目服务层 —— 工作台全部业务逻辑的唯一入口。
 * API 路由只做入参校验与调用；前端只消费返回的 DTO。
 * 「AI 剧组流水线」的数据聚合（资产/引用/轨道/过期锚点/运行状态）都在此汇出。
 */

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: { beats: true; clips: true; series: { select: { title: true } } };
}>;

const BASE_INCLUDE = {
  beats: { orderBy: { index: "asc" as const } },
  clips: { orderBy: { order: "asc" as const } },
  series: { select: { title: true } },
} satisfies Prisma.ProjectInclude;

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
    energyStart: b.energyStart,
    energyEnd: b.energyEnd,
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
    finalPrompt: c.finalPrompt,
    promptVersion: c.promptVersion,
    energy: c.energy,
    sfxHint: c.sfxHint,
  };
}

async function requireProjectRow(
  id: string
): Promise<ProjectWithRelations> {
  const p = await db.project.findUnique({ where: { id }, include: BASE_INCLUDE });
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
    include: {
      _count: { select: { beats: true, clips: true } },
      series: { select: { title: true } },
    },
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
    seriesId: r.seriesId,
    seriesTitle: r.series?.title ?? null,
    episodeNo: r.episodeNo,
    /* v2.9.2：交付可达性——项目库不只有「进入再生产」，成片已合成的项目
       直接给出成片/制作包入口（库即交付中枢，VLM 产品走查 P0） */
    finalVideoUrl: r.finalVideoUrl,
  }));
}

/**
 * 立项草稿 —— 「全组开机」的第一步。
 * 只落题材快照与工程参数（剧本/分镜/资产全部由流水线阶段产出），
 * 保证创作过程全程有库可依、断点可续。
 */
export async function createProjectDraft(
  payload: CreateProjectDraftPayload
): Promise<ProjectDetail> {
  if (payload.synopsis.trim().length < 10) {
    throw new RouteError("剧情梗概太短，请输入至少 10 个字的梗概", 422);
  }
  const p = await db.project.create({
    data: {
      title:
        payload.title?.trim() ||
        defaultTitle(payload.genre.name, payload.synopsis),
      status: "draft",
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
    },
    include: BASE_INCLUDE,
  });
  return assembleDetail(p);
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const p = await requireProjectRow(id);
  return assembleDetail(p);
}

/** 聚合制作包全量：分镜 + 镜头轨 + 资产 + 引用 + 轨道 + 过期锚点 + 运行状态 */
async function assembleDetail(p: ProjectWithRelations): Promise<ProjectDetail> {
  const [assets, shotRefs, tracks, staleClipIds, activeRun] = await Promise.all([
    listAssets(p.id),
    listRefs(p.id),
    listTracks(p.id),
    computeStaleClipIds(p.id),
    getLatestRun(p.id),
  ]);
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
    seriesId: p.seriesId,
    seriesTitle: p.series?.title ?? null,
    episodeNo: p.episodeNo,
    assets,
    shotRefs,
    tracks,
    anchorStaleClipIds: staleClipIds,
    activeRun,
    finalVideoUrl: p.finalVideoUrl,
    transitionMode: p.transitionMode,
    gradePreset: p.gradePreset,
  };
}

export async function updateProject(
  id: string,
  patch: {
    title?: string;
    synopsis?: string;
    status?: ProjectStatus;
    modelConfig?: ModelConfig;
    storyBeats?: StoryBeat[];
    /** v2.5 §7.11：转场策略（cut/fade/auto） */
    transitionMode?: string;
    /** v2.5 §7.11：调色预设键；空串 = 跟随题材（落库为 null） */
    gradePreset?: string | null;
  }
): Promise<ProjectDetail> {
  await requireProjectRow(id);
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
  if (patch.transitionMode !== undefined) {
    data.transitionMode = patch.transitionMode;
  }
  if (patch.gradePreset !== undefined) {
    // 空串统一为 null（跟随题材影调），白名单校验已在 zod 层完成
    const key = patch.gradePreset?.trim();
    data.gradePreset = key ? key : null;
  }

  // 分镜整体替换（事务保证原子性）；既有镜头轨的 beatIndex 引用可能失效，
  // 一并钳制到有效范围内，避免悬挂引用
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
          energyStart: b.energyStart ?? null,
          energyEnd: b.energyEnd ?? null,
        })),
      });
      const validIndexes = patch.storyBeats!.map((b) => b.index);
      await tx.timelineClip.updateMany({
        where: { projectId: id, beatIndex: { notIn: validIndexes } },
        data: { beatIndex: validIndexes[0] },
      });
    });
    return getProject(id);
  }

  await db.project.update({ where: { id }, data });
  return getProject(id);
}

export async function deleteProject(id: string): Promise<void> {
  await requireProjectRow(id);
  await db.project.delete({ where: { id } });
}

/** 场次级能量回写（导演阶段：场首/场尾能量取自本场首末镜头） */
export async function updateBeatEnergy(
  projectId: string,
  beatIndex: number,
  energy: { energyStart: number | null; energyEnd: number | null }
): Promise<void> {
  const beat = await db.storyBeat.findFirst({
    where: { projectId, index: beatIndex },
  });
  if (!beat) return;
  await db.storyBeat.update({
    where: { id: beat.id },
    data: {
      energyStart: energy.energyStart,
      energyEnd: energy.energyEnd,
    },
  });
}

/** —— 镜头轨管理 —— */

/**
 * 分镜拆解回写：用 AI 拆解出的镜头组替换指定场次的全部片段。
 * 事务内：删旧 → 按场次分组重排插入新镜头 → 重写全局 order。
 * v2 协议：同步写入 energy / sfxHint / visualPrompt（锚定与落轨的数据来源）。
 */
export async function replaceActClips(
  projectId: string,
  beatIndex: number,
  shots: Array<ShotBreakdownItem>
): Promise<ClipData[]> {
  const project = await requireProjectRow(projectId);
  const beat = project.beats.find((b) => b.index === beatIndex);
  if (!beat) throw new RouteError(`第 ${beatIndex} 场不存在，无法拆解`, 400);
  const locked = project.clips.filter(
    (c) => c.beatIndex === beatIndex && c.status === "ready"
  );
  if (locked.length > 0) {
    throw new RouteError(
      `该场已有 ${locked.length} 个已生成的镜头，请先重置为待生成后再重新拆解`,
      409
    );
  }

  await db.$transaction(async (tx) => {
    await tx.timelineClip.deleteMany({
      where: { projectId, beatIndex },
    });
    // 按场分组重排：保留其他场片段的相对顺序，新镜头替换该场段
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
            visualPrompt: item.shot.visualPrompt,
            plannedMs: item.shot.plannedMs,
            energy: item.shot.energy,
            sfxHint: item.shot.sfxHint || null,
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

  const fresh = await requireProjectRow(projectId);
  return fresh.clips.map(mapClip);
}

export async function createClip(
  projectId: string,
  input: { beatIndex: number; name: string; subtitle: string; format: string }
): Promise<ClipData> {
  const project = await requireProjectRow(projectId);
  const beatExists = project.beats.some((b) => b.index === input.beatIndex);
  if (!beatExists) throw new RouteError(`关联的第 ${input.beatIndex} 场不存在`, 400);

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
    shotSize?: string | null;
    visualDesc?: string | null;
    energy?: number | null;
    sfxHint?: string | null;
    /** 人工微调最终提示词：落库后标记 manual，锚定阶段跳过不覆盖 */
    finalPrompt?: string | null;
  }
): Promise<ClipData> {
  const existing = await db.timelineClip.findUnique({ where: { id: clipId } });
  if (!existing) throw new RouteError("镜头片段不存在或已被删除", 404);
  if (patch.status && !(patch.status in CLIP_STATUS)) {
    throw new RouteError("非法的镜头状态", 400);
  }
  /* v2.9.8 外部出片入库护栏：http(s) 外链直接 PATCH 会让镜头格子变绿但合成必败
     （ffmpeg 只消费本地素材，外部链接不可读）——拒绝并指引进库端点
     （下载落盘自包含）；本地 /assets/ 地址与重置（null）不受影响 */
  if (patch.mediaUrl && /^https?:\/\//.test(patch.mediaUrl)) {
    throw new RouteError(
      "外部链接不能直接作为镜头成片（合成只消费已入库素材）：请经贴片入库接口 POST /api/clips/{id}/media 提交，将自动下载落盘并标记完成",
      422
    );
  }
  const data: Prisma.TimelineClipUpdateInput = { ...patch };
  // 人工微调提示词 → 指纹标记 manual（不会被流水线覆盖，也不再判过期）
  if (patch.finalPrompt !== undefined) {
    data.promptVersion = patch.finalPrompt ? "manual" : null;
  }
  const clip = await db.timelineClip.update({ where: { id: clipId }, data });
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
  const project = await requireProjectRow(projectId);
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

/** —— 导出（与原版 v1.2.0 schema 对齐 + v2 可选扩展段） —— */

export async function exportProject(id: string): Promise<DramaProjectData> {
  return toExportData(await getProject(id));
}
