"use client";

import { create } from "zustand";
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
  /** v2.9 连载：系列归属（null = 独立项目，续写时自动升级为系列第 1 集） */
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
  saving: boolean;
  lastError: string | null;
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
  /** 断点续拍：从首个未成功阶段继续 */
  retryPipeline: () => Promise<boolean>;
  /** 拉取项目详情并刷新会话（制作包全量） */
  refreshProject: () => Promise<void>;
  /** 拉取渲染任务列表；存在活跃任务时自动继续轮询 */
  fetchTasks: () => Promise<void>;
  /** 提交渲染任务（portrait/video），返回错误信息或 null */
  createTask: (kind: TaskKind, target: { assetId?: string; clipId?: string }) => Promise<string | null>;
  /** 重试/取消任务 */
  retryTask: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  /** 编辑资产锚点（refCount>0 时需显式解冻确认） */
  updateAsset: (
    assetId: string,
    patch: { name?: string; lockedAppearance?: string; visualAnchor?: string },
    confirmUnfreeze: boolean
  ) => Promise<string | null>;
  /** 重新锚定：对全部非人工微调镜头重跑组装管线（解冻后的恢复入口） */
  reanchor: () => Promise<boolean>;

  /** —— v2.4 一键成片 —— */
  /** 一键渲染全片：批量提交 video + voiceover 任务（幂等去重） */
  renderAll: () => Promise<boolean>;
  /** 成片合成：ffmpeg 产出整集视频，回写 finalVideoUrl；返回错误信息或 null */
  composeEpisode: () => Promise<string | null>;
  /** 合成进行中 */
  composing: boolean;

  /** —— v2.9 连载产品化 —— */
  /** 一键续写下一集：独立项目自动升级为系列第 1 集；题材/参数继承、资产克隆（定妆图沿用）。
   *  成功后自动切会话到新集。seriesId 入口供项目库系列分组直发。 */
  createNextEpisode: (input: {
    synopsis: string;
    seriesId?: string;
  }) => Promise<
    | { ok: true; episodeNo: number; clonedAssets: number; seriesTitle: string }
    | { ok: false; error: string }
  >;
  /** 续写请求进行中 */
  creatingEpisode: boolean;

  addClip: (beatIndex: number) => Promise<boolean>;
  patchClip: (clipId: string, patch: Partial<ClipData>) => Promise<boolean>;
  removeClip: (clipId: string) => Promise<boolean>;
  moveClip: (clipId: string, dir: -1 | 1) => Promise<boolean>;

  /** 切换某场的运镜（本地即时生效；已入库项目异步同步） */
  setBeatMovement: (beatIndex: number, movement: string) => void;
  /** AI 分镜拆解：把一场拆成 3~5 镜头写入镜头轨 */
  breakdownAct: (beatIndex: number) => Promise<string | null>;
  /** 拆解进行中的场次序号（null = 无） */
  breakingDown: number | null;
}

/** 统一请求器：解析 { ok, data | error } 封套 */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as
    | { ok: true; data: T }
    | { ok: false; error: string };
  if (!res.ok || !json.ok) {
    throw new Error(("error" in json && json.error) || `请求失败 (${res.status})`);
  }
  return json.data;
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
  modelConfig: {
    videoModel: "Omni 1.2 Flash",
    durationSeconds: 5,
    resolution: "720p",
    scriptThinkingLevel: "low",
    enablePromptEnhance: true,
  },
  session: null,
  generating: false,
  generatingStep: 0,
  saving: false,
  lastError: null,
  activeRun: null,
  pipelineStarting: false,
  tasks: [],
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

  closeSession: () =>
    set({ session: null, activeRun: null, tasks: [], outputNonce: get().outputNonce + 1 }),

  generate: async () => {
    const { genreId, synopsis, modelConfig } = get();
    if (synopsis.trim().length < 10) return false;
    set({ generating: true, generatingStep: 0, lastError: null });
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
      set({ generating: false });
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
      return true;
    } finally {
      set({ saving: false });
    }
  },

  fetchLibrary: async () => {
    set({ libraryLoading: true });
    try {
      const list = await api<ProjectSummary[]>("/api/projects");
      set({ library: list });
    } finally {
      set({ libraryLoading: false });
    }
  },

  removeProject: async (id) => {
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      set((s) => ({
        library: s.library.filter((p) => p.id !== id),
        session:
          s.session?.dbId === id ? null : s.session,
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

  setBeatMovement: (beatIndex, movement) => {
    const { session } = get();
    if (!session) return;
    const beats = session.beats.map((b) =>
      b.index === beatIndex ? { ...b, cameraMovement: movement } : b
    );
    set({ session: { ...session, beats } });
    // 已入库项目：静默同步（失败不回滚本地，下次保存会覆盖）
    if (session.dbId) {
      void api(`/api/projects/${session.dbId}`, {
        method: "PATCH",
        body: JSON.stringify({ storyBeats: beats }),
      }).catch(() => undefined);
    }
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
      const run = await api<RunDTO>(`/api/projects/${projectId}/runs`, {
        method: "POST",
      });
      set({ activeRun: run });
      startRunPolling(run.id);
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
    try {
      const run = await api<RunDTO>(`/api/runs/${runId}/retry`, { method: "POST" });
      set({ activeRun: run, lastError: null });
      startRunPolling(run.id);
      return true;
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : "续拍失败" });
      return false;
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
      const hadActive = get().tasks.some(
        (t) => t.status === "queued" || t.status === "running"
      );
      set({ tasks });
      if (tasks.some((t) => t.status === "queued" || t.status === "running")) {
        scheduleTaskPolling();
      } else if (hadActive) {
        // 从活跃转静默：回灌一次项目详情（产物地址可能已回写）
        stopTaskPolling();
        void get().refreshProject();
      }
    } catch {
      /* 忽略瞬时错误 */
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
    try {
      await api(`/api/tasks/${taskId}/retry`, { method: "POST" });
      void get().fetchTasks();
    } catch {
      /* 任务中心会展示最新状态 */
    }
  },

  cancelTask: async (taskId) => {
    try {
      await api(`/api/tasks/${taskId}/cancel`, { method: "POST" });
      void get().fetchTasks();
    } catch {
      /* 任务中心会展示最新状态 */
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

  renderAll: async () => {
    const dbId = get().session?.dbId;
    if (!dbId) return false;
    try {
      await api<{ submitted: number; skipped: number; totalClips: number }>(
        `/api/projects/${dbId}/render-all`,
        { method: "POST" }
      );
      void get().fetchTasks();
      return true;
    } catch {
      return false;
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
  // v2.9 · 连载产品化（docs/architecture-v2.md §7.14）
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
        error: err instanceof Error ? err.message : "续写下一集失败",
      };
    } finally {
      set({ creatingEpisode: false });
    }
  },
}));
