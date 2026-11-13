"use client";

import { create } from "zustand";
import { toast } from "@/hooks/use-toast";
import { GENRES } from "@/lib/genres";
import {
  type AssetDTO,
  type ClipData,
  type ClipStatus,
  type GenrePreset,
  type ModelConfig,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectSummary,
  type RunDTO,
  type ShotRefDTO,
  type StoryBeat,
  type TaskDTO,
  type TaskKind,
  type TrackItemDTO,
} from "@/lib/drama";
/**
 * 工作台全局状态（Zustand）
 * - 服务器状态（项目库、镜头轨）经 API 同步于此
 * - 组件只订阅所需切片，不直接 fetch
 * - 扩容点：新增动作（如批量导入、协作）在此追加，不改动组件契约
 */

/** 工作台当前会话：未保存的生成结果与已入库项目共用同一形态 */
export interface WorkbenchSession {
  dbId: string | null;
  title: string;
  status: ProjectStatus;
  genre: GenrePreset;
  synopsis: string;
  modelConfig: ModelConfig;
  beats: StoryBeat[];
  clips: ClipData[];
  /** —— v2 制作包（立项后由服务端聚合） —— */
  assets: AssetDTO[];
  shotRefs: ShotRefDTO[];
  tracks: TrackItemDTO[];
  anchorStaleClipIds: string[];
  /** v2.4：成片产物地址（null = 尚未合成） */
  finalVideoUrl: string | null;
  /** v2.5 §7.11：转场策略（cut/fade/auto） */
  transitionMode: string;
  /** v2.5 §7.11：调色预设键（null = 跟随题材影调） */
  gradePreset: string | null;
  /** v2.9 连载：系列归属（null = 独立项目，创作下一集时自动升级为连续剧第 1 集） */
  seriesId: string | null;
  seriesTitle: string | null;
  episodeNo: number | null;
}

interface WorkbenchState {
  // 配置区
  genreId: string;
  synopsis: string;
  modelConfig: ModelConfig;
  // 会话
  session: WorkbenchSession | null;
  // 状态标记
  generating: boolean;
  generatingStep: number;
  /** v2.9.7：本次试笔开始时间戳（秒表展示用，防止长推演被误认为卡死） */
  generatingSince: number | null;
  saving: boolean;
  lastError: string | null;
  /** v2.9.12：上次会话恢复因瞬时故障失败（键保留，刷新自愈）——
   *  落地页据此提示「现场还在，可重试」，而不是默默把用户丢回空表单 */
  lastRestoreFailed: boolean;
  // —— v2 剧组流水线 ——
  /** 进行中/最近一次流水线运行（null = 从未开机） */
  activeRun: RunDTO | null;
  /** 开机请求进行中（防止重复点击） */
  pipelineStarting: boolean;
  /** 渲染任务列表（定妆照/镜头渲染，轮询刷新） */
  tasks: TaskDTO[];
  // 项目库
  library: ProjectSummary[];
  libraryOpen: boolean;
  libraryLoading: boolean;
  // 输出区引用（供滚动定位）
  outputNonce: number;

  selectGenre: (genreId: string) => void;
  setSynopsis: (s: string) => void;
  patchModelConfig: (patch: Partial<ModelConfig>) => void;
  setGeneratedBeats: (beats: StoryBeat[]) => void;
  loadProject: (detail: ProjectDetail) => void;
  closeSession: () => void;

  generate: () => Promise<boolean>;
  saveProject: () => Promise<boolean>;
  fetchLibrary: () => Promise<void>;
  removeProject: (id: string) => Promise<boolean>;
  renameProject: (id: string, title: string) => Promise<boolean>;
  setLibraryOpen: (open: boolean) => void;

  /** —— v2 剧组流水线 —— */
  /** 全组开机：未立项先立项草稿，已立项则同步最新梗概后启动流水线 */
  startPipeline: () => Promise<boolean>;
  /** 断点续拍：从首个未成功阶段继续；v2.9.10 补在途态 + 防重入（焦急连点双发 retry） */
  retryPipeline: () => Promise<boolean>;
  /** 续拍请求进行中（按钮禁用/转圈依据） */
  retryingPipeline: boolean;
  /** 拉取项目详情并刷新会话（制作包全量） */
  refreshProject: () => Promise<void>;
  /** 拉取渲染任务列表；存在活跃任务时自动继续轮询 */
  fetchTasks: () => Promise<void>;
  /** 提交渲染任务（portrait/video），返回错误信息或 null */
  createTask: (kind: TaskKind, target: { assetId?: string; clipId?: string }) => Promise<string | null>;
  /** 重试/取消任务；v2.9.10 返回错误信息（此前 catch 静默吞——官方失败恢复入口「点了没反应」）
   *  taskActionBusy 记录在途任务 id（行内图标转圈/禁用依据） */
  retryTask: (taskId: string) => Promise<string | null>;
  cancelTask: (taskId: string) => Promise<string | null>;
  /** 任务行内动作在途（taskId -> "retry" | "cancel"） */
  taskActionBusy: Record<string, "retry" | "cancel">;
  /** 编辑资产锚点（refCount>0 时需显式解冻确认） */
  updateAsset: (
    assetId: string,
    patch: { name?: string; lockedAppearance?: string; visualAnchor?: string },
    confirmUnfreeze: boolean
  ) => Promise<string | null>;
  /** 重新锚定：对全部非人工微调镜头重跑组装管线（解冻后的恢复入口） */
  reanchor: () => Promise<boolean>;

  /** —— v2.4 一键成片 —— */
  /** 一键渲染全片：批量提交 video + voiceover 任务（幂等去重）；
   *  v2.9.10 补在途态 + 防重入（POST /render-all 批量建任务慢网下数秒无反馈，且可连点重复提交） */
  renderAll: () => Promise<boolean>;
  /** 一键渲染提交进行中（按钮禁用/转圈依据） */
  renderingAll: boolean;
  /** 成片合成：ffmpeg 产出整集视频，回写 finalVideoUrl；返回错误信息或 null */
  composeEpisode: () => Promise<string | null>;
  /** 合成进行中 */
  composing: boolean;

  /** —— v2.9 连续剧创作路径 —— */
  /** 创作下一集：独立项目自动升级为连续剧第 1 集；题材/参数继承、资产克隆（定妆图沿用）。
   *  成功后自动切会话到新集。seriesId 入口供项目库系列分组直发。 */
  createNextEpisode: (input: {
    synopsis: string;
    seriesId?: string;
  }) => Promise<
    | { ok: true; episodeNo: number; clonedAssets: number; seriesTitle: string }
    | { ok: false; error: string }
  >;
  /** 创作下一集请求进行中 */
  creatingEpisode: boolean;
  /** v2.9.5：创作下一集弹窗全局开合——从成片页签提升到会话层，任意页签可发起（信息卡/交付区共用） */
  nextEpOpen: boolean;
  setNextEpOpen: (open: boolean) => void;

  /** v2.9.7：视频通道是否真机（null = 未探明，按真机口径展示不误导）——
   *  占位模式下渲染中文案/tooltip/提交回执统一换成贴片指引口径 */
  videoChannelReal: boolean | null;
  /** 通道模式探明（幂等，页面挂载时调用一次） */
  probeVideoChannel: () => Promise<void>;
  /** v2.9.7 断线重进：恢复上次会话（运行观测/任务轮询随载入续接）。
   *  无可恢复或已删除返回 null；已有会话不覆盖。 */
  restoreLastSession: () => Promise<ProjectDetail | null>;

  addClip: (beatIndex: number) => Promise<boolean>;
  patchClip: (clipId: string, patch: Partial<ClipData>) => Promise<boolean>;
  removeClip: (clipId: string) => Promise<boolean>;
  moveClip: (clipId: string, dir: -1 | 1) => Promise<boolean>;

  /** 切换场次运镜：本地立即生效；已入库项目同步 PATCH。
   *  v2.9.10 返回同步结果（此前 fire-and-forget + 组件立即报成功——同步失败时是误导性成功提示） */
  setBeatMovement: (beatIndex: number, movement: string) => Promise<boolean>;
  /** AI 分镜拆解：把一场拆成 3~5 镜头写入镜头轨 */
  breakdownAct: (beatIndex: number) => Promise<string | null>;
  /** 拆解进行中的场次序号（null = 无） */
  breakingDown: number | null;
}

/** 统一请求器：解析 { ok, data | error } 封套。
 *  v2.9.12 用户视角走查：网络层失败（断线/服务器重启）此前裸抛
 *  "Failed to fetch" 英文技术报错直出到 toast——统一人话化收口：
 *  告知连接中断 + 明确「任务不会丢、重进可续看」，用户不必恐慌重开。
 *  ApiError 携带 HTTP status：调用方可区分「资源不存在(404)」与
 *  「瞬时故障(网络/5xx)」——恢复逻辑靠它避免误清用户现场。 */
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(
      "与剧组服务器的连接中断了——请检查网络后重试；已提交的拍摄任务不会丢失，重进页面可继续观测进度",
    );
  }
  let json: { ok: true; data: T } | { ok: false; error: string };
  try {
    json = (await res.json()) as { ok: true; data: T } | { ok: false; error: string };
  } catch {
    throw new ApiError(
      `剧组服务器返回了无法识别的响应 (${res.status})——请稍后重试；若反复出现请截图反馈`,
      res.status,
    );
  }
  if (!res.ok || !json.ok) {
    throw new ApiError(
      ("error" in json && json.error) || `请求失败 (${res.status})`,
      res.status,
    );
  }
  return json.data;
}

// ============================================================
// v2.9.7 会话持久化（断线重进恢复现场）：
// 「全组拍摄中，请勿离开本页（断线重进可自动恢复观测）」的兑现依赖——
// 刷新后自动回到上次项目（运行观测/任务轮询随 loadProject 续接）。
// 显式「另起新项目」时清除，保证新用户空态不被旧会话覆盖。
// ============================================================
const LAST_PROJECT_KEY = "drama-workshop:last-project";

function persistLastProjectId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(LAST_PROJECT_KEY, id);
    else window.localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    /* 隐私模式等存储不可用：跳过，不影响主流程 */
  }
}

/** v2.9.7 批次落定播报：上一拍还在执行的任务已全部进入终态。
 *  成功/失败一并交代，失败给首条原因与下一步指引（占位模式给贴片指引）——
 *  E2E 走查 P0：任务结果此前只静默地躺在任务中心，用户等不到任何提醒。 */
function notifyBatchSettled(
  prev: TaskDTO[],
  next: TaskDTO[],
  realVideo: boolean | null
): void {
  const nextById = new Map(next.map((t) => [t.id, t]));
  let okCount = 0;
  const failed: TaskDTO[] = [];
  for (const p of prev) {
    if (p.status !== "queued" && p.status !== "running") continue;
    const now = nextById.get(p.id);
    if (!now) continue;
    if (now.status === "succeeded") okCount++;
    else if (now.status === "failed") failed.push(now);
    /* cancelled：用户主动取消，不播报 */
  }
  if (okCount === 0 && failed.length === 0) return;
  const brief = (s: string) =>
    s.length > 64 ? `${s.slice(0, 64)}…` : s;
  if (failed.length === 0) {
    toast({
      title: `渲染任务完成 · ${okCount} 项`,
      description: "产物已自动回填（镜头成片 / 配音 / 定妆照），无需手动刷新",
    });
    return;
  }
  toast({
    title: `本批渲染 ${failed.length} 项未成功`,
    description:
      (realVideo === false
        ? "视频通道为占位模式（零配额）：可在镜头轨贴片入库（直链自动下载/本地上传），或启用真机通道后重试"
        : `${okCount > 0 ? `${okCount} 项已完成；` : ""}可在「剧组进程」任务中心逐项重试`) +
      `。首条原因：${brief(failed[0].error ?? "未知")}`,
    variant: "destructive",
  });
}

function fallbackGenre(detail: ProjectDetail): GenrePreset {
  const preset = GENRES.find((g) => g.id === detail.genreId);
  if (preset) return preset;
  return {
    id: detail.genreId,
    name: detail.genre.name,
    short: detail.genre.name,
    badge: detail.genre.badge,
    icon: "🎬",
    hookTactic: detail.genre.hookTactic,
    musicMood: detail.genre.musicMood,
    tonePrompt: detail.genre.tonePrompt,
    sampleSynopsis: detail.synopsis,
  };
}

/** 项目详情 → 会话（loadProject / refreshProject 共用） */
function detailToSession(detail: ProjectDetail): WorkbenchSession {
  return {
    dbId: detail.id,
    title: detail.title,
    status: detail.status,
    genre: fallbackGenre(detail),
    synopsis: detail.synopsis,
    modelConfig: detail.modelConfig,
    beats: detail.storyBeats,
    clips: detail.timelineClips,
    assets: detail.assets,
    shotRefs: detail.shotRefs,
    tracks: detail.tracks,
    anchorStaleClipIds: detail.anchorStaleClipIds,
    finalVideoUrl: detail.finalVideoUrl,
    transitionMode: detail.transitionMode,
    gradePreset: detail.gradePreset,
    seriesId: detail.seriesId ?? null,
    seriesTitle: detail.seriesTitle ?? null,
    episodeNo: detail.episodeNo ?? null,
  };
}

/** 会话 → 导出用项目详情（未入库项目以本地形态导出，schema 不变） */
export function sessionToDetail(s: WorkbenchSession): ProjectDetail {
  return {
    id: s.dbId ?? "local",
    title: s.title,
    status: s.status,
    schemaVersion: "1.2.0",
    genreId: s.genre.id,
    genreName: s.genre.name,
    genreBadge: s.genre.badge,
    beatCount: s.beats.length,
    clipCount: s.clips.length,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    seriesId: null,
    seriesTitle: null,
    episodeNo: null,
    synopsis: s.synopsis,
    aspectRatio: "9:16",
    modelConfig: s.modelConfig,
    genre: {
      id: s.genre.id,
      name: s.genre.name,
      badge: s.genre.badge,
      hookTactic: s.genre.hookTactic,
      musicMood: s.genre.musicMood,
      tonePrompt: s.genre.tonePrompt,
    },
    storyBeats: s.beats,
    timelineClips: s.clips,
    assets: s.assets,
    shotRefs: s.shotRefs,
    tracks: s.tracks,
    anchorStaleClipIds: s.anchorStaleClipIds,
    activeRun: null,
    finalVideoUrl: s.finalVideoUrl,
    transitionMode: s.transitionMode,
    gradePreset: s.gradePreset,
  };
}

// ============================================================
// 轮询器（模块级单例，与页面同生命周期；切换项目时由动作显式停止）
// 设计依据：docs/architecture-v2.md §7.3 —— 前端不连队列，只轮询 REST
// ============================================================

let runPollTimer: ReturnType<typeof setInterval> | null = null;
let taskPollTimer: ReturnType<typeof setTimeout> | null = null;

function stopRunPolling() {
  if (runPollTimer) {
    clearInterval(runPollTimer);
    runPollTimer = null;
  }
}

/** 流水线运行轮询：1.5s 间隔；终态时停止并回灌最新制作包 */
function startRunPolling(runId: string) {
  stopRunPolling();
  runPollTimer = setInterval(() => {
    void (async () => {
      try {
        const run = await api<RunDTO>(`/api/runs/${runId}`);
        useWorkbench.setState({ activeRun: run });
        if (run.status !== "running") {
          /* v2.9.18 自动续拍等待窗：failed 且 error 仍带「Ns 后自动续拍」
             承诺时绝不能停表——服务端 45~180s 后自动点火，停表会让面板
             永远停在失败态，「无需值守」在 UI 层断裂。承诺消失（达上限/
             清扫改写）或杀青时才真正停。 */
          const pendingAutoResume =
            run.status === "failed" &&
            /后自动续拍第 \d+\/\d+ 轮/.test(run.error ?? "");
          if (!pendingAutoResume) {
            stopRunPolling();
            const dbId = useWorkbench.getState().session?.dbId;
            if (dbId) {
              if (run.status === "succeeded") {
                await useWorkbench.getState().refreshProject();
                useWorkbench.setState((s) => ({ outputNonce: s.outputNonce + 1 }));
              }
              void useWorkbench.getState().fetchTasks();
            }
          }
        }
      } catch {
        /* 瞬时网络错误：保留轮询，下次重试 */
      }
    })();
  }, 1500);
}

function stopTaskPolling() {
  if (taskPollTimer) {
    clearTimeout(taskPollTimer);
    taskPollTimer = null;
  }
}

/** 渲染任务轮询：存在活跃任务时 2.5s 链式轮询；静默后回灌项目详情 */
function scheduleTaskPolling() {
  stopTaskPolling();
  taskPollTimer = setTimeout(() => {
    void useWorkbench.getState().fetchTasks();
  }, 2500);
}

export const useWorkbench = create<WorkbenchState>((set, get) => ({
  genreId: "shuangwen",
  synopsis: "",
  videoChannelReal: null,
  generatingSince: null,
  modelConfig: {
    videoModel: "Omni 1.2 Flash",
    durationSeconds: 5,
    resolution: "720p",
    scriptThinkingLevel: "low",
    enablePromptEnhance: true,
  },
  session: null,
  nextEpOpen: false,
  generating: false,
  generatingStep: 0,
  saving: false,
  lastError: null,
  lastRestoreFailed: false,
  activeRun: null,
  pipelineStarting: false,
  retryingPipeline: false,
  tasks: [],
  taskActionBusy: {},
  library: [],
  libraryOpen: false,
  libraryLoading: false,
  outputNonce: 0,

  selectGenre: (genreId) => {
    if (genreId === get().genreId) return;
    set({ genreId, session: null, activeRun: null, tasks: [] });
  },
  setSynopsis: (synopsis) => set({ synopsis: synopsis.slice(0, 500) }),
  patchModelConfig: (patch) =>
    set((s) => ({ modelConfig: { ...s.modelConfig, ...patch } })),

  setGeneratedBeats: (beats) => {
    const { genreId, synopsis, modelConfig, session } = get();
    const genre = GENRES.find((g) => g.id === genreId) ?? GENRES[0];
    set({
      session: {
        dbId: session?.dbId ?? null,
        title: session?.title ?? `${genre.name} · ${synopsis.slice(0, 10)}…`,
        status: session?.status ?? "beatsReady",
        genre,
        synopsis: synopsis.trim(),
        modelConfig,
        beats,
        clips: session?.clips ?? [],
        assets: session?.assets ?? [],
        shotRefs: session?.shotRefs ?? [],
        tracks: session?.tracks ?? [],
        anchorStaleClipIds: session?.anchorStaleClipIds ?? [],
        finalVideoUrl: session?.finalVideoUrl ?? null,
        transitionMode: session?.transitionMode ?? "auto",
        gradePreset: session?.gradePreset ?? null,
        seriesId: session?.seriesId ?? null,
        seriesTitle: session?.seriesTitle ?? null,
        episodeNo: session?.episodeNo ?? null,
      },
      outputNonce: get().outputNonce + 1,
    });
  },

  loadProject: (detail) => {
    persistLastProjectId(detail.id);
    set({
      genreId: detail.genreId,
      synopsis: detail.synopsis,
      modelConfig: detail.modelConfig,
      session: detailToSession(detail),
      activeRun: detail.activeRun,
      libraryOpen: false,
      outputNonce: get().outputNonce + 1,
    });
    if (detail.activeRun?.status === "running") startRunPolling(detail.activeRun.id);
    void get().fetchTasks();
  },

  /* v2.9.7 修复（另起新项目入口启用后暴露）：关会话必须停两个轮询器——
     否则 run 轮询会持续把已清空的 activeRun 写回来，任务轮询空转；
     同步清持久化键，下次刷新不再回到旧片场。 */
  closeSession: () => {
    stopRunPolling();
    stopTaskPolling();
    persistLastProjectId(null);
    set({
      session: null,
      activeRun: null,
      tasks: [],
      synopsis: "",
      outputNonce: get().outputNonce + 1,
    });
  },

  generate: async () => {
    const { genreId, synopsis, modelConfig } = get();
    if (synopsis.trim().length < 10) return false;
    set({ generating: true, generatingStep: 0, generatingSince: Date.now(), lastError: null });
    try {
      const { storyBeats } = await api<{ storyBeats: StoryBeat[] }>("/api/generate", {
        method: "POST",
        body: JSON.stringify({ genreId, synopsis, modelConfig }),
      });
      get().setGeneratedBeats(storyBeats);
      return true;
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : "未知错误" });
      return false;
    } finally {
      set({ generating: false, generatingSince: null });
    }
  },

  saveProject: async () => {
    const { session } = get();
    if (!session) return false;
    set({ saving: true });
    try {
      if (session.dbId) {
        const detail = await api<ProjectDetail>(`/api/projects/${session.dbId}`, {
          method: "PATCH",
          body: JSON.stringify({
            synopsis: session.synopsis,
            modelConfig: session.modelConfig,
            storyBeats: session.beats,
          }),
        });
        set((s) => ({
          session: s.session
            ? { ...s.session, dbId: detail.id, status: detail.status, title: detail.title }
            : s.session,
        }));
      } else {
        // v2 契约：先立项草稿（题材快照 + 工程参数），再回写场次分镜
        const created = await api<ProjectDetail>("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            genre: {
              id: session.genre.id,
              name: session.genre.name,
              badge: session.genre.badge,
              hookTactic: session.genre.hookTactic,
              musicMood: session.genre.musicMood,
              tonePrompt: session.genre.tonePrompt,
            },
            synopsis: session.synopsis,
            modelConfig: session.modelConfig,
          }),
        });
        const detail = await api<ProjectDetail>(`/api/projects/${created.id}`, {
          method: "PATCH",
          body: JSON.stringify({ storyBeats: session.beats }),
        });
        set((s) => ({ session: s.session ? detailToSession(detail) : s.session }));
      }
      await get().fetchLibrary();
      /* v2.9.7：保存入库即成为「上次现场」 */
      const savedId = get().session?.dbId;
      if (savedId) persistLastProjectId(savedId);
      return true;
    } catch (err) {
      /* v2.9.17：保存失败必须报给用户——此前无 catch，网络错误/5xx 时
         异常直接抛穿 handleSave，「保存失败」toast 永不出现，用户只看到
         转圈结束毫无反馈（静默失败，违背过程反馈纪律） */
      set({ lastError: err instanceof Error ? err.message : "保存失败，请检查网络后重试" });
      return false;
    } finally {
      set({ saving: false });
    }
  },

  fetchLibrary: async () => {
    set({ libraryLoading: true });
    try {
      const list = await api<ProjectSummary[]>("/api/projects");
      set({ library: list });
    } catch {
      /* v2.9.17：项目库拉取失败不抛穿（多处 void 调用会产生未处理拒绝）；
         列表保持原样，抽屉内已有重试入口（再次打开即重拉） */
    } finally {
      set({ libraryLoading: false });
    }
  },

  removeProject: async (id) => {
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      const wasCurrent = get().session?.dbId === id;
      if (wasCurrent) {
        stopRunPolling();
        stopTaskPolling();
        persistLastProjectId(null);
      }
      set((s) => ({
        library: s.library.filter((p) => p.id !== id),
        session: wasCurrent ? null : s.session,
        activeRun: wasCurrent ? null : s.activeRun,
        tasks: wasCurrent ? [] : s.tasks,
      }));
      return true;
    } catch {
      return false;
    }
  },

  renameProject: async (id, title) => {
    try {
      await api<ProjectDetail>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      set((s) => ({
        library: s.library.map((p) => (p.id === id ? { ...p, title } : p)),
        session: s.session?.dbId === id ? { ...s.session, title } : s.session,
      }));
      return true;
    } catch {
      return false;
    }
  },

  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setNextEpOpen: (nextEpOpen) => set({ nextEpOpen }),

  addClip: async (beatIndex) => {
    const { session } = get();
    if (!session?.dbId) return false;
    const beat = session.beats.find((b) => b.index === beatIndex);
    if (!beat) return false;
    try {
      const clip = await api<ClipData>(`/api/projects/${session.dbId}/clips`, {
        method: "POST",
        body: JSON.stringify({
          beatIndex,
          name: `${beat.actTitle.split("：")[0]} · ${beat.dialogueSubtitle.slice(0, 12)}`,
          subtitle: beat.dialogueSubtitle,
          format: "mp4",
        }),
      });
      set((s) => ({
        session: s.session
          ? {
              ...s.session,
              status: "inProduction",
              clips: [...s.session.clips, clip],
            }
          : s.session,
      }));
      return true;
    } catch {
      return false;
    }
  },

  patchClip: async (clipId, patch) => {
    const { session } = get();
    if (!session?.dbId) return false;
    try {
      const clip = await api<ClipData>(`/api/clips/${clipId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      set((s) => ({
        session: s.session
          ? {
              ...s.session,
              clips: s.session.clips.map((c) => (c.id === clipId ? clip : c)),
            }
          : s.session,
      }));
      return true;
    } catch {
      return false;
    }
  },

  removeClip: async (clipId) => {
    const { session } = get();
    if (!session?.dbId) return false;
    try {
      await api(`/api/clips/${clipId}`, { method: "DELETE" });
      set((s) => ({
        session: s.session
          ? {
              ...s.session,
              clips: s.session.clips
                .filter((c) => c.id !== clipId)
                .map((c, i) => ({ ...c, order: i })),
            }
          : s.session,
      }));
      return true;
    } catch {
      return false;
    }
  },

  moveClip: async (clipId, dir) => {
    const { session } = get();
    if (!session?.dbId) return false;
    const clips = [...session.clips].sort((a, b) => a.order - b.order);
    const i = clips.findIndex((c) => c.id === clipId);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= clips.length) return false;
    [clips[i], clips[j]] = [clips[j], clips[i]];
    try {
      await api(`/api/projects/${session.dbId}/clips`, {
        method: "PUT",
        body: JSON.stringify({ clipIds: clips.map((c) => c.id) }),
      });
      set((s) => ({
        session: s.session
          ? { ...s.session, clips: clips.map((c, idx) => ({ ...c, order: idx })) }
          : s.session,
      }));
      return true;
    } catch {
      return false;
    }
  },

  breakingDown: null,

  setBeatMovement: async (beatIndex, movement) => {
    const { session } = get();
    if (!session) return false;
    const beats = session.beats.map((b) =>
      b.index === beatIndex ? { ...b, cameraMovement: movement } : b
    );
    set({ session: { ...session, beats } });
    // 已入库项目：同步入库（本地乐观更新不回滚，失败时报给用户——下次保存会覆盖自愈）
    if (session.dbId) {
      try {
        await api(`/api/projects/${session.dbId}`, {
          method: "PATCH",
          body: JSON.stringify({ storyBeats: beats }),
        });
        return true;
      } catch {
        return false;
      }
    }
    return true;
  },

  breakdownAct: async (beatIndex) => {
    const { session } = get();
    if (!session?.dbId) return "请先「保存到项目库」，AI 拆解需要项目已入库";
    set({ breakingDown: beatIndex });
    try {
      const res = await api<{ shots: unknown[]; clips: ClipData[] }>(
        `/api/projects/${session.dbId}/beats/${beatIndex}/breakdown`,
        { method: "POST" }
      );
      set((s) => ({
        session: s.session
          ? { ...s.session, status: "inProduction", clips: res.clips }
          : s.session,
      }));
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "拆解失败，请重试";
    } finally {
      set({ breakingDown: null });
    }
  },

  // ============================================================
  // v2 · 剧组流水线与渲染任务（docs/architecture-v2.md §7.3/§8）
  // ============================================================

  startPipeline: async () => {
    const { genreId, synopsis, modelConfig, session, pipelineStarting } = get();
    if (pipelineStarting) return false;
    if (synopsis.trim().length < 10) {
      set({ lastError: "请先输入至少 10 个字的剧情梗概" });
      return false;
    }
    set({ pipelineStarting: true, lastError: null });
    /* v2.9.6 剧本过稿开机：会话剧本与当前输入（梗概/题材/编剧深度）一致时，
       开机沿用已过目剧本不重写（「先试笔 · 满意再开机」的承诺兑现）；
       影响剧本的输入任一改动 → 重写。机组/时长/规格不影响剧本，可放心改 */
    const scriptReusable =
      !!session &&
      session.beats.length > 0 &&
      session.synopsis === synopsis.trim() &&
      session.genre.id === genreId &&
      session.modelConfig.scriptThinkingLevel === modelConfig.scriptThinkingLevel;
    try {
      let projectId = session?.dbId ?? null;
      if (projectId && session && session.synopsis !== synopsis.trim()) {
        // 梗概有改动：先同步到项目再开机（流水线读取服务端项目数据）
        await api(`/api/projects/${projectId}`, {
          method: "PATCH",
          body: JSON.stringify({ synopsis: synopsis.trim(), modelConfig }),
        });
      }
      if (!projectId) {
        // 立项草稿：题材快照 + 工程参数，剧本/资产/分镜全部由流水线产出
        const genre = GENRES.find((g) => g.id === genreId) ?? GENRES[0];
        const created = await api<ProjectDetail>("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            genre: {
              id: genre.id,
              name: genre.name,
              badge: genre.badge,
              hookTactic: genre.hookTactic,
              musicMood: genre.musicMood,
              tonePrompt: genre.tonePrompt,
            },
            synopsis: synopsis.trim(),
            modelConfig,
          }),
        });
        projectId = created.id;
        set({ session: detailToSession(created) });
      }
      if (scriptReusable) {
        // 已过目剧本随开机入库（试笔会话未立项 / 用户在分镜页签改过剧本，均同步服务端）
        const synced = await api<ProjectDetail>(`/api/projects/${projectId}`, {
          method: "PATCH",
          body: JSON.stringify({
            synopsis: synopsis.trim(),
            modelConfig,
            storyBeats: session!.beats,
          }),
        });
        set((s) => (s.session ? { session: detailToSession(synced) } : {}));
      }
      const run = await api<RunDTO>(`/api/projects/${projectId}/runs`, {
        method: "POST",
        body: JSON.stringify({ keepScript: scriptReusable }),
      });
      set({ activeRun: run });
      startRunPolling(run.id);
      persistLastProjectId(projectId);
      void get().fetchLibrary();
      return true;
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : "开机失败，请稍后重试" });
      return false;
    } finally {
      set({ pipelineStarting: false });
    }
  },

  retryPipeline: async () => {
    const runId = get().activeRun?.id;
    if (!runId) return false;
    if (get().retryingPipeline) return false; // 防重入：续拍在途时连点不再双发
    set({ retryingPipeline: true });
    try {
      const run = await api<RunDTO>(`/api/runs/${runId}/retry`, { method: "POST" });
      set({ activeRun: run, lastError: null });
      startRunPolling(run.id);
      return true;
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : "续拍失败" });
      return false;
    } finally {
      set({ retryingPipeline: false });
    }
  },

  /* v2.9.7：通道模式探明（幂等）——null 期间一律按真机口径展示，不误导读用户 */
  probeVideoChannel: async () => {
    if (get().videoChannelReal !== null) return;
    try {
      const res = await fetch("/api/channel");
      const json = await res.json();
      if (json?.ok) set({ videoChannelReal: Boolean(json.data?.realVideo) });
    } catch {
      /* 探明失败保持 null（真机口径），下次挂载重试 */
    }
  },

  restoreLastSession: async () => {
    if (get().session) return null; // 已有会话不覆盖
    let id: string | null = null;
    try {
      id = window.localStorage.getItem(LAST_PROJECT_KEY);
    } catch {
      return null;
    }
    if (!id) return null;
    try {
      const detail = await api<ProjectDetail>(`/api/projects/${id}`);
      get().loadProject(detail);
      return detail;
    } catch (err) {
      // v2.9.12：区分「项目已删除(404)」与「瞬时故障(网络/5xx)」——
      // 此前一律清键，断线时用户重进页面永远回不到拍摄中的项目
      //（违背「断线重进可自动恢复观测」承诺）。瞬时失败保留键，下次刷新自愈。
      if (err instanceof ApiError && err.status === 404) {
        persistLastProjectId(null);
        return null;
      }
      set({ lastRestoreFailed: true });
      return null;
    }
  },

  refreshProject: async () => {
    const dbId = get().session?.dbId;
    if (!dbId) return;
    try {
      const detail = await api<ProjectDetail>(`/api/projects/${dbId}`);
      set((s) => ({
        session: s.session ? detailToSession(detail) : s.session,
        activeRun: detail.activeRun,
      }));
    } catch {
      /* 项目可能已被删除：保留当前会话 */
    }
  },

  fetchTasks: async () => {
    const dbId = get().session?.dbId;
    if (!dbId) return;
    try {
      const tasks = await api<TaskDTO[]>(`/api/projects/${dbId}/tasks`);
      const prev = get().tasks;
      const hadActive = prev.some(
        (t) => t.status === "queued" || t.status === "running"
      );
      set({ tasks });
      if (tasks.some((t) => t.status === "queued" || t.status === "running")) {
        scheduleTaskPolling();
      } else if (hadActive) {
        // 从活跃转静默：回灌一次项目详情（产物地址可能已回写）+ 批次落定播报（v2.9.7）
        stopTaskPolling();
        void get().refreshProject();
        notifyBatchSettled(prev, tasks, get().videoChannelReal);
      }
    } catch {
      /* v2.9.7 断链自愈：链式轮询一次瞬时错误（网络抖动/dev 编译延迟）就会
         永久断链，任务冻结在「进行中」无人观测——仍有活跃任务时必须续排 */
      if (get().tasks.some((t) => t.status === "queued" || t.status === "running")) {
        scheduleTaskPolling();
      }
    }
  },

  createTask: async (kind, target) => {
    const { session } = get();
    if (!session?.dbId) return "请先立项（全组开机或保存项目）再提交任务";
    try {
      await api(`/api/projects/${session.dbId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ kind, ...target }),
      });
      void get().fetchTasks();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "任务提交失败";
    }
  },

  retryTask: async (taskId) => {
    if (get().taskActionBusy[taskId]) return "上一个操作仍在进行中"; // 防连点
    set((s) => ({ taskActionBusy: { ...s.taskActionBusy, [taskId]: "retry" } }));
    try {
      await api(`/api/tasks/${taskId}/retry`, { method: "POST" });
      void get().fetchTasks();
      return null;
    } catch (err) {
      /* v2.9.10：官方失败恢复入口不能静默——重试失败要报给用户 */
      return err instanceof Error ? err.message : "重试提交失败";
    } finally {
      set((s) => {
        const next = { ...s.taskActionBusy };
        delete next[taskId];
        return { taskActionBusy: next };
      });
    }
  },

  cancelTask: async (taskId) => {
    if (get().taskActionBusy[taskId]) return "上一个操作仍在进行中"; // 防连点
    set((s) => ({ taskActionBusy: { ...s.taskActionBusy, [taskId]: "cancel" } }));
    try {
      await api(`/api/tasks/${taskId}/cancel`, { method: "POST" });
      void get().fetchTasks();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "取消提交失败";
    } finally {
      set((s) => {
        const next = { ...s.taskActionBusy };
        delete next[taskId];
        return { taskActionBusy: next };
      });
    }
  },

  updateAsset: async (assetId, patch, confirmUnfreeze) => {
    try {
      await api(`/api/assets/${assetId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, confirmUnfreeze }),
      });
      await get().refreshProject();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "资产更新失败";
    }
  },

  reanchor: async () => {
    const dbId = get().session?.dbId;
    if (!dbId) return false;
    try {
      await api<{ anchored: number; skipped: number }>(
        `/api/projects/${dbId}/anchor`,
        { method: "POST" }
      );
      await get().refreshProject();
      return true;
    } catch {
      return false;
    }
  },

  // ============================================================
  // v2.4 · 一键成片（docs/architecture-v2.md §7.9）
  // ============================================================

  composing: false,
  renderingAll: false,

  renderAll: async () => {
    const dbId = get().session?.dbId;
    if (!dbId) return false;
    if (get().renderingAll) return false; // 防重入：批量提交在途时连点不再重复建任务
    set({ renderingAll: true });
    try {
      await api<{ submitted: number; skipped: number; totalClips: number }>(
        `/api/projects/${dbId}/render-all`,
        { method: "POST" }
      );
      void get().fetchTasks();
      return true;
    } catch {
      return false;
    } finally {
      set({ renderingAll: false });
    }
  },

  composeEpisode: async () => {
    const dbId = get().session?.dbId;
    if (!dbId) return "请先立项再合成成片";
    set({ composing: true });
    try {
      const res = await api<{ finalVideoUrl: string; durationSec: number }>(
        `/api/projects/${dbId}/compose`,
        { method: "POST" }
      );
      await get().refreshProject();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "成片合成失败";
    } finally {
      set({ composing: false });
    }
  },

  // ============================================================
  // v2.9 · 连续剧创作路径（docs/architecture-v2.md §7.14；
  // v2.9.15 叙事校准：不是「续写文本」，是连续剧的逐集创作路径）
  // ============================================================

  creatingEpisode: false,

  createNextEpisode: async ({ synopsis, seriesId }) => {
    if (get().creatingEpisode) return { ok: false, error: "正在创建下一集，请稍候" };
    set({ creatingEpisode: true });
    try {
      // 系列入口（项目库分组）走系列端点；会话入口走项目一键端点（自动 adopt + 继承）
      const detail = seriesId
        ? await api<
            ProjectDetail & {
              seriesId: string;
              episodeNo: number;
              clonedAssets: number;
            }
          >(`/api/series/${seriesId}/episodes`, {
            method: "POST",
            body: JSON.stringify({ synopsis, cloneAssets: true }),
          })
        : await api<
            ProjectDetail & {
              seriesId: string;
              seriesTitle: string;
              episodeNo: number;
              clonedAssets: number;
            }
          >(`/api/projects/${get().session?.dbId}/next-episode`, {
            method: "POST",
            body: JSON.stringify({ synopsis }),
          });
      // 切会话到新集（左栏同步题材/参数，立即续产）+ 刷新项目库分组
      get().loadProject(detail);
      void get().fetchLibrary();
      const seriesTitle =
        ("seriesTitle" in detail && detail.seriesTitle) ||
        get().session?.seriesTitle ||
        "";
      return {
        ok: true,
        episodeNo: detail.episodeNo,
        clonedAssets: detail.clonedAssets,
        seriesTitle,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "创作下一集失败",
      };
    } finally {
      set({ creatingEpisode: false });
    }
  },
}));
