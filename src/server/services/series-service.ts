import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import type {
  CreateEpisodePayload,
  CreateProjectDraftPayload,
  ProjectDetail,
  SeriesDetail,
  SeriesSummary,
} from "@/lib/drama";
import { createProjectDraft, getProject } from "./project-service";
import { createTask } from "./task-service";
import { getTextProvider } from "@/server/providers/factory";

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
      finalVideoUrl: p.finalVideoUrl,
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

  return {
    ...detail,
    seriesId: series.id,
    seriesTitle: series.title,
    episodeNo,
    clonedAssets,
  };
}

/* ============================================================
 * 连载产品化（v2.9）—— 「续写下一集」一键动线
 *
 * 产品动机：连载是这个品类的留存引擎（日更/周更）。系列 API
 * （建系列/加剧集/批量提交）v2.3 已就绪，但用户在界面上无法发起——
 * 本节把「独立项目 → 连载系列 → 下一集」收敛为一次点击：
 * - 独立项目自动升级（adopt）为系列第 1 集，零迁移、只回写两列；
 * - 题材/模型参数缺省继承上一集，资产库可克隆（定妆图沿用）；
 * - 返回新集全量详情，前端直接切会话续产。
 * ============================================================ */

/** 从项目标题提取系列名：「X · 第 N 集 / 演示第一集」→「X」 */
function seriesTitleFromProjectTitle(title: string): string {
  return title.split(" · ")[0].trim() || title.trim();
}

/**
 * 独立项目升级为系列第 1 集（adopt）。
 * 幂等：已属某系列时直接返回该系列，不重复建档。
 */
export async function adoptProjectAsSeriesEpisode1(
  projectId: string,
  opts?: { seriesTitle?: string }
): Promise<SeriesSummary> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new RouteError("项目不存在或已被删除", 404);

  if (project.seriesId) {
    const s = await db.series.findUnique({
      where: { id: project.seriesId },
      include: { _count: { select: { episodes: true } } },
    });
    if (s) {
      return {
        id: s.id,
        title: s.title,
        synopsis: s.synopsis,
        genreName: s.genreName,
        episodeCount: s._count.episodes,
        updatedAt: s.updatedAt.toISOString(),
      };
    }
  }

  const series = await db.series.create({
    data: {
      title:
        opts?.seriesTitle?.trim() ||
        seriesTitleFromProjectTitle(project.title),
      synopsis: project.synopsis,
      genreId: project.genreId,
      genreName: project.genreName,
      genreBadge: project.genreBadge,
      hookTactic: project.hookTactic,
      musicMood: project.musicMood,
      tonePrompt: project.tonePrompt,
    },
  });

  await db.project.update({
    where: { id: project.id },
    data: { seriesId: series.id, episodeNo: 1 },
  });

  return {
    id: series.id,
    title: series.title,
    synopsis: series.synopsis,
    genreName: series.genreName,
    episodeCount: 1,
    updatedAt: series.updatedAt.toISOString(),
  };
}

/**
 * AI 接钩子（v2.9.5 连载降门槛）：编剧室根据本集剧本（尤其卡点留钩场）
 * 与题材战术手册，起草下一集承接梗概（80~150 字）。
 * - 目标用户是「不太会写剧情走向」的普通创作者——AI 先写一稿，
 *   用户在续写弹窗里可改后开机（梗概框始终可编辑，AI 只是降门槛不是代笔）；
 * - 文本通道（LLM）调用，零视频配额；思考档跟随项目编剧深度；
 * - 输出纪律：只出梗概正文，承接上集钩子、不引入未铺垫的新设定、结尾留新钩子。
 */
export async function draftNextEpisodeSynopsis(projectId: string): Promise<string> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { beats: { orderBy: { index: "asc" } } },
  });
  if (!project) throw new RouteError("项目不存在或已被删除", 404);

  const script = project.beats
    .map(
      (b) =>
        `【场 ${b.index} · ${b.actTitle} · ${b.narrativeFunction}】\n画面：${b.description}\n金句：${b.dialogueSubtitle}`
    )
    .join("\n\n");

  const provider = getTextProvider();
  const { text } = await provider.complete({
    messages: [
      {
        role: "system",
        content: `你是竖屏短剧编剧室的资深主笔，正在为连载短剧写下一集的承接梗概。
规则：
- 只输出梗概正文（80~150 字，中文），不要标题、引号或任何解释；
- 必须承接上一集结尾的钩子（卡点留钩场），延续人物与冲突，不引入上一集未铺垫的全新设定；
- 按题材钩子战术推进爽点节奏：${project.hookTactic || "前 3 秒给冲突，结尾留钩"};
- 结尾留新的钩子，驱动追更。`,
      },
      {
        role: "user",
        content: `题材：${project.genreName}
上一集梗概：${project.synopsis}
上一集剧本：
${script}

请写下一集承接梗概。`,
      },
    ],
    thinking: { type: project.thinkingLevel === "high" ? "enabled" : "disabled" },
  });

  const draft = text
    .trim()
    .replace(/^["「『]/, "")
    .replace(/["」』]$/, "");
  if (draft.length < 10) {
    throw new RouteError("AI 起草的梗概过短，请重试或手动填写", 502);
  }
  return draft;
}

/**
 * 一键续写下一集：无系列先 adopt 当前项目为第 1 集，再追加第 N+1 集。
 * 返回新集全量详情 + 继承元数据（前端切会话即续产）。
 */
export async function continueWithNextEpisode(
  projectId: string,
  input: { synopsis: string; title?: string; cloneAssets?: boolean }
): Promise<
  ProjectDetail & {
    seriesId: string;
    seriesTitle: string;
    episodeNo: number;
    clonedAssets: number;
  }
> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new RouteError("项目不存在或已被删除", 404);

  // 独立项目 → 连载第 1 集（幂等：已有系列则沿用）；
  // 注意必须取 adopt 返回值——内存里的 project.seriesId 还是旧值
  const seriesId =
    project.seriesId ?? (await adoptProjectAsSeriesEpisode1(projectId)).id;

  const created = await addEpisode(seriesId, {
    synopsis: input.synopsis,
    title: input.title,
    // 连载铁律：默认沿用上一集资产库（同一角色跨集同一张脸）
    cloneAssets: input.cloneAssets ?? true,
  });

  const series = await db.series.findUnique({
    where: { id: created.seriesId },
  });

  // 重新取全量详情（含系列归属/聚合字段），前端直接切会话
  const detail = await getProject(created.id);
  return {
    ...detail,
    seriesId: created.seriesId,
    seriesTitle: series?.title ?? "",
    episodeNo: created.episodeNo,
    clonedAssets: created.clonedAssets,
  };
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
