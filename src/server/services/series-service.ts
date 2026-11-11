import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import type {
  CreateEpisodePayload,
  CreateProjectDraftPayload,
  SeriesDetail,
  SeriesSummary,
} from "@/lib/drama";
import { createProjectDraft } from "./project-service";
import { createTask } from "./task-service";

/**
 * 系列服务（v2.3）—— 多剧集连载的编排入口。
 *
 * 设计（docs/architecture-v2.md §7.5）：
 * - 系列只存「基调」（题材快照 + 简介），剧集仍是独立 Project，
 *   旧数据零迁移（seriesId 可空）；
 * - 跨集资产复用走「资产克隆」：深拷贝到新剧集，定妆图地址直接引用
 *   （同一角色跨集同一张脸），规避跨集引用的一致性复杂度；
 * - 系列级批量提交：遍历剧集逐个 enqueue，复用单任务提交的幂等去重。
 */

async function requireSeries(id: string) {
  const s = await db.series.findUnique({
    where: { id },
    include: { episodes: true },
  });
  if (!s) throw new RouteError("系列不存在或已被删除", 404);
  return s;
}

export async function createSeries(input: {
  title: string;
  synopsis?: string;
  genre?: CreateProjectDraftPayload["genre"];
}): Promise<SeriesSummary> {
  const row = await db.series.create({
    data: {
      title: input.title.trim(),
      synopsis: input.synopsis?.trim() ?? "",
      genreId: input.genre?.id ?? "",
      genreName: input.genre?.name ?? "",
      genreBadge: input.genre?.badge ?? "",
      hookTactic: input.genre?.hookTactic ?? "",
      musicMood: input.genre?.musicMood ?? "",
      tonePrompt: input.genre?.tonePrompt ?? "",
    },
  });
  return {
    id: row.id,
    title: row.title,
    synopsis: row.synopsis,
    genreName: row.genreName,
    episodeCount: 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSeries(): Promise<SeriesSummary[]> {
  const rows = await db.series.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { episodes: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    synopsis: r.synopsis,
    genreName: r.genreName,
    episodeCount: r._count.episodes,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getSeriesDetail(id: string): Promise<SeriesDetail> {
  const s = await requireSeries(id);
  const episodes = await db.project.findMany({
    where: { seriesId: s.id },
    orderBy: { episodeNo: "asc" },
    include: {
      _count: { select: { beats: true, clips: true } },
      clips: { select: { plannedMs: true } },
    },
  });
  return {
    id: s.id,
    title: s.title,
    synopsis: s.synopsis,
    genreId: s.genreId,
    genreName: s.genreName,
    genreBadge: s.genreBadge,
    hookTactic: s.hookTactic,
    musicMood: s.musicMood,
    tonePrompt: s.tonePrompt,
    episodes: episodes.map((p) => ({
      id: p.id,
      episodeNo: p.episodeNo ?? 0,
      title: p.title,
      status: p.status as SeriesDetail["episodes"][number]["status"],
      clipCount: p._count.clips,
      beatCount: p._count.beats,
      plannedMs: p.clips.reduce(
        (sum, c) => sum + (c.plannedMs ?? 0),
        0
      ),
      updatedAt: p.updatedAt.toISOString(),
    })),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** 深拷贝上一集资产库到新剧集（含定妆图地址引用，跨集视觉一致） */
async function cloneAssets(fromProjectId: string, toProjectId: string) {
  const assets = await db.asset.findMany({
    where: { projectId: fromProjectId },
  });
  let copied = 0;
  for (const a of assets) {
    await db.asset.create({
      data: {
        projectId: toProjectId,
        kind: a.kind,
        name: a.name,
        lockedAppearance: a.lockedAppearance,
        visualAnchor: a.visualAnchor,
        voiceProfile: a.voiceProfile,
        // 定妆图直接引用原地址：同一角色跨集同一张脸
        portraitUrl: a.portraitUrl,
        source: a.source,
      },
    });
    copied++;
  }
  return copied;
}

/**
 * 新建剧集 —— 追加为系列第 N+1 集。
 * 题材快照缺省继承系列；模型参数缺省继承上一集；可选克隆上一集资产库。
 */
export async function addEpisode(
  seriesId: string,
  input: CreateEpisodePayload
) {
  const series = await requireSeries(seriesId);

  const prevEpisodes = await db.project.findMany({
    where: { seriesId: series.id },
    orderBy: { episodeNo: "desc" },
    take: 1,
  });
  const prev = prevEpisodes[0] ?? null;
  const episodeNo = (prev?.episodeNo ?? 0) + 1;

  // 题材继承：本集传入 > 系列快照 > 上一集快照
  const genreSource =
    input.genre ??
    (series.genreId
      ? {
          id: series.genreId,
          name: series.genreName,
          badge: series.genreBadge,
          hookTactic: series.hookTactic,
          musicMood: series.musicMood,
          tonePrompt: series.tonePrompt,
        }
      : prev
        ? {
            id: prev.genreId,
            name: prev.genreName,
            badge: prev.genreBadge,
            hookTactic: prev.hookTactic,
            musicMood: prev.musicMood,
            tonePrompt: prev.tonePrompt,
          }
        : null);
  if (!genreSource) {
    throw new RouteError(
      "系列未留档题材快照：请在系列建档时提供题材，或本集请求中传入 genre",
      422
    );
  }

  // 模型参数继承：本集传入 > 上一集工程参数 > 服务端默认
  const modelConfig =
    input.modelConfig ??
    (prev
      ? {
          videoModel: prev.videoModel,
          durationSeconds: prev.durationSeconds as 3 | 5 | 8,
          resolution: prev.resolution as "540p" | "720p" | "1080p",
          scriptThinkingLevel: prev.thinkingLevel as "low" | "medium" | "high",
          enablePromptEnhance: prev.promptEnhance,
        }
      : {
          videoModel: "Omni 1.2 Flash",
          durationSeconds: 5,
          resolution: "720p",
          scriptThinkingLevel: "low",
          enablePromptEnhance: true,
        });

  const detail = await createProjectDraft({
    title: input.title?.trim() || `${series.title} · 第 ${episodeNo} 集`,
    genre: genreSource,
    synopsis: input.synopsis,
    modelConfig,
  });

  await db.project.update({
    where: { id: detail.id },
    data: { seriesId: series.id, episodeNo },
  });

  let clonedAssets = 0;
  if (input.cloneAssets && prev) {
    clonedAssets = await cloneAssets(prev.id, detail.id);
  }

  return { ...detail, seriesId: series.id, episodeNo, clonedAssets };
}

/**
 * 系列级批量提交（§4 C11）。
 * - kind=video：遍历全部剧集的待拍镜头（有最终提示词）逐个提交渲染任务；
 * - kind=portrait：遍历全部剧集缺定妆图的资产逐个提交定妆任务。
 * 单任务幂等去重由 task-service 承担（409 计入 skipped，不中断批量）。
 */
export async function batchRenderSeries(
  seriesId: string,
  kind: "video" | "portrait" | "voiceover"
) {
  const series = await requireSeries(seriesId);
  const projects = await db.project.findMany({
    where: { seriesId: series.id },
    orderBy: { episodeNo: "asc" },
    select: { id: true, episodeNo: true },
  });

  const perEpisode: Array<{
    episodeNo: number;
    projectId: string;
    submitted: number;
    skipped: number;
  }> = [];
  let submitted = 0;
  let skipped = 0;

  for (const p of projects) {
    let epSubmitted = 0;
    let epSkipped = 0;

    if (kind === "voiceover") {
      const clips = await db.timelineClip.findMany({
        where: { projectId: p.id },
        select: { id: true },
      });
      for (const c of clips) {
        try {
          await createTask(p.id, { kind: "voiceover", clipId: c.id });
          epSubmitted++;
        } catch {
          epSkipped++;
        }
      }
    } else if (kind === "video") {
      const clips = await db.timelineClip.findMany({
        where: {
          projectId: p.id,
          status: { in: ["pending", "failed"] },
          finalPrompt: { not: null },
        },
        select: { id: true },
      });
      for (const c of clips) {
        try {
          await createTask(p.id, { kind: "video", clipId: c.id });
          epSubmitted++;
        } catch {
          epSkipped++; // 已有进行中同类任务等幂等拦截
        }
      }
    } else {
      const assets = await db.asset.findMany({
        where: { projectId: p.id, portraitUrl: null },
        select: { id: true },
      });
      for (const a of assets) {
        try {
          await createTask(p.id, { kind: "portrait", assetId: a.id });
          epSubmitted++;
        } catch {
          epSkipped++;
        }
      }
    }

    submitted += epSubmitted;
    skipped += epSkipped;
    perEpisode.push({
      episodeNo: p.episodeNo ?? 0,
      projectId: p.id,
      submitted: epSubmitted,
      skipped: epSkipped,
    });
  }

  return { seriesId: series.id, kind, submitted, skipped, perEpisode };
}
