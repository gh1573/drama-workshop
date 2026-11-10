"use client";

import { create } from "zustand";
import { GENRES } from "@/lib/genres";
import {
  type ClipData,
  type ClipStatus,
  type GenrePreset,
  type ModelConfig,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectSummary,
  type SaveProjectPayload,
  type StoryBeat,
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

  addClip: (beatIndex: number) => Promise<boolean>;
  patchClip: (clipId: string, patch: Partial<ClipData>) => Promise<boolean>;
  removeClip: (clipId: string) => Promise<boolean>;
  moveClip: (clipId: string, dir: -1 | 1) => Promise<boolean>;

  /** 切换某幕的运镜（本地即时生效；已入库项目异步同步） */
  setBeatMovement: (beatIndex: number, movement: string) => void;
  /** AI 分镜拆解：把一幕拆成 3~5 镜头写入镜头轨 */
  breakdownAct: (beatIndex: number) => Promise<string | null>;
  /** 拆解进行中的幕序号（null = 无） */
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
    gradient: "from-red-600 via-rose-600 to-amber-500",
    ring: "ring-red-500/70",
    text: "text-red-400",
    sampleSynopsis: detail.synopsis,
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
  };
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
  library: [],
  libraryOpen: false,
  libraryLoading: false,
  outputNonce: 0,

  selectGenre: (genreId) => {
    if (genreId === get().genreId) return;
    set({ genreId, session: null });
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
      },
      outputNonce: get().outputNonce + 1,
    });
  },

  loadProject: (detail) => {
    const genre = fallbackGenre(detail);
    set({
      genreId: detail.genreId,
      synopsis: detail.synopsis,
      modelConfig: detail.modelConfig,
      session: {
        dbId: detail.id,
        title: detail.title,
        status: detail.status,
        genre,
        synopsis: detail.synopsis,
        modelConfig: detail.modelConfig,
        beats: detail.storyBeats,
        clips: detail.timelineClips,
      },
      libraryOpen: false,
      outputNonce: get().outputNonce + 1,
    });
  },

  closeSession: () => set({ session: null, outputNonce: get().outputNonce + 1 }),

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
    const { session, modelConfig, genreId, synopsis } = get();
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
        const payload: SaveProjectPayload = {
          genre: {
            id: genreId,
            name: session.genre.name,
            badge: session.genre.badge,
            hookTactic: session.genre.hookTactic,
            musicMood: session.genre.musicMood,
            tonePrompt: session.genre.tonePrompt,
          },
          synopsis: synopsis || session.synopsis,
          modelConfig,
          storyBeats: session.beats,
          status: "beatsReady",
        };
        const detail = await api<ProjectDetail>("/api/projects", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        set((s) => ({
          session: s.session
            ? { ...s.session, dbId: detail.id, title: detail.title, status: detail.status }
            : s.session,
        }));
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
}));
