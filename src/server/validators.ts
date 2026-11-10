import { z } from "zod";

/**
 * API 入参校验（zod）—— 所有写操作路由统一使用
 * 契约变更只改这里，服务层与前端类型保持解耦
 */

export const modelConfigSchema = z.object({
  videoModel: z.string().min(1).max(60),
  durationSeconds: z.union([z.literal(3), z.literal(5), z.literal(8)]),
  resolution: z.enum(["540p", "720p", "1080p"]),
  scriptThinkingLevel: z.enum(["low", "medium", "high"]),
  enablePromptEnhance: z.boolean(),
});

const genreSnapshotSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  badge: z.string().min(1).max(60),
  hookTactic: z.string().min(1).max(300),
  musicMood: z.string().min(1).max(200),
  tonePrompt: z.string().min(1).max(500),
});

export const storyBeatSchema = z.object({
  index: z.number().int().min(1).max(99),
  actTitle: z.string().min(1).max(120),
  narrativeFunction: z.enum(["hook", "climax", "cliffhanger"]),
  pacingNote: z.string().min(1).max(200),
  description: z.string().min(1).max(600),
  dialogueSubtitle: z.string().min(1).max(120),
  cameraMovement: z.string().min(1).max(40),
  promptGuidance: z.string().min(1).max(600),
  energyStart: z.number().int().min(0).max(100).nullable().optional(),
  energyEnd: z.number().int().min(0).max(100).nullable().optional(),
});

/** 立项草稿（「全组开机」第一步：无分镜，剧本由流水线产出） */
export const createDraftSchema = z.object({
  title: z.string().max(80).optional(),
  genre: genreSnapshotSchema,
  synopsis: z.string().min(10).max(500),
  modelConfig: modelConfigSchema,
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  synopsis: z.string().min(10).max(500).optional(),
  status: z.enum(["draft", "beatsReady", "inProduction", "archived"]).optional(),
  modelConfig: modelConfigSchema.optional(),
  storyBeats: z.array(storyBeatSchema).length(3).optional(),
});

export const createClipSchema = z.object({
  beatIndex: z.number().int().min(1).max(99),
  name: z.string().min(1).max(80),
  subtitle: z.string().max(120).default(""),
  format: z.enum(["mp4", "mov", "webm"]).default("mp4"),
});

export const updateClipSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  subtitle: z.string().max(120).optional(),
  format: z.enum(["mp4", "mov", "webm"]).optional(),
  status: z.enum(["pending", "generating", "ready", "failed"]).optional(),
  mediaUrl: z.string().url().max(500).nullable().optional(),
  durationMs: z.number().int().min(0).max(600000).nullable().optional(),
  cameraMovement: z.string().max(40).nullable().optional(),
  plannedMs: z.number().int().min(0).max(600000).nullable().optional(),
  shotSize: z.string().max(20).nullable().optional(),
  visualDesc: z.string().max(600).nullable().optional(),
  energy: z.number().int().min(0).max(100).nullable().optional(),
  sfxHint: z.string().max(24).nullable().optional(),
  finalPrompt: z.string().max(4000).nullable().optional(),
});

export const reorderClipsSchema = z.object({
  clipIds: z.array(z.string().min(1)).min(1).max(99),
});

/** —— 资产契约 —— */

export const createAssetSchema = z.object({
  kind: z.enum(["character", "scene", "prop"]),
  name: z.string().min(1).max(30),
  lockedAppearance: z.string().min(5).max(400),
  visualAnchor: z.string().min(3).max(500),
  voiceProfile: z
    .object({
      voiceId: z.string().max(60),
      speed: z.number().min(0.5).max(2),
      style: z.string().max(60),
    })
    .nullable()
    .optional(),
});

export const updateAssetSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  lockedAppearance: z.string().min(5).max(400).optional(),
  visualAnchor: z.string().min(3).max(500).optional(),
  voiceProfile: z
    .object({
      voiceId: z.string().max(60),
      speed: z.number().min(0.5).max(2),
      style: z.string().max(60),
    })
    .nullable()
    .optional(),
  /** 锚点解冻确认：改动已被镜头锚定的资产外观必须显式携带 */
  confirmUnfreeze: z.boolean().optional(),
});

export const bindRefSchema = z.object({
  assetId: z.string().min(1),
  stateNote: z.string().max(60).nullable().optional(),
});

/** —— 任务契约 —— */

export const createTaskSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("portrait"), assetId: z.string().min(1) }),
  z.object({ kind: z.literal("video"), clipId: z.string().min(1) }),
  z.object({ kind: z.literal("voiceover"), clipId: z.string().min(1) }),
]);

/** —— 轨道契约 —— */

export const createTrackSchema = z.object({
  kind: z.enum(["subtitle", "sfx", "bgm"]),
  clipId: z.string().nullable().optional(),
  startMs: z.number().int().min(0).max(600000),
  endMs: z.number().int().min(1).max(600000),
  text: z.string().min(1).max(200),
  style: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updateTrackSchema = z.object({
  startMs: z.number().int().min(0).max(600000).optional(),
  endMs: z.number().int().min(1).max(600000).optional(),
  text: z.string().min(1).max(200).optional(),
  style: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** zod 校验失败 → 人类可读错误信息 */
export function firstZodError(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "入参校验失败";
  const path = issue.path.join(".");
  return `参数 ${path || "(root)"} 校验失败：${issue.message}`;
}
