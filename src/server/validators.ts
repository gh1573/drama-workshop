import { z } from "zod";
import { GRADE_PRESETS, TRANSITION_MODES } from "@/config/templates";

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
  /** v2.7 场次化剧本：功能枚举从固定三幕扩展为 5 类（含旧数据兼容的 climax） */
  narrativeFunction: z.enum([
    "hook",
    "buildup",
    "twist",
    "climax",
    "cliffhanger",
  ]),
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
  // v2.9.11：delivered=成片已合成（compose-service 交付时置位；补拍后回 inProduction）
  status: z.enum(["draft", "beatsReady", "inProduction", "delivered", "archived"]).optional(),
  modelConfig: modelConfigSchema.optional(),
  /** v2.7 场次化剧本：场次数弹性 3~6（与 screenplay.ts SCENE_COUNT_* 同步） */
  storyBeats: z.array(storyBeatSchema).min(3).max(6).optional(),
  // v2.5 成片视觉专业化（§7.11）：转场策略与调色预设（L3 白名单校验，非空时）
  transitionMode: z
    .enum(TRANSITION_MODES.map((m) => m.value) as [string, ...string[]])
    .optional(),
  gradePreset: z
    .string()
    .refine((v) => v === "" || v in GRADE_PRESETS, {
      message: "调色预设不在 GRADE_PRESETS 白名单内",
    })
    .nullable()
    .optional(),
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
  /* v2.9.8：贴片入库后回写本地 /assets/ 地址（外链会被服务层护栏拒绝并指引入库端点） */
  mediaUrl: z
    .string()
    .max(500)
    .refine((v) => v.startsWith("/assets/") || /^https?:\/\//.test(v), {
      message: "成片地址须为 /assets/ 本地路径或 http(s) 链接",
    })
    .nullable()
    .optional(),
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
  kind: z.enum(["subtitle", "sfx", "bgm", "voiceover"]),
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

/** —— 系列契约（v2.3） —— */

export const createSeriesSchema = z.object({
  title: z.string().min(1).max(80),
  synopsis: z.string().max(500).default(""),
  /** 题材快照（可选，建剧集时默认继承） */
  genre: genreSnapshotSchema.optional(),
});

export const createEpisodeSchema = z.object({
  title: z.string().max(80).optional(),
  synopsis: z.string().min(10).max(500),
  /** 从上一集克隆资产库（含定妆图引用） */
  cloneAssets: z.boolean().default(false),
  genre: genreSnapshotSchema.optional(),
  modelConfig: modelConfigSchema.optional(),
});

/** 一键续写下一集（v2.9 连载产品化）：梗概必填（承接上一集剧情），
 *  资产克隆默认开启——同一角色跨集同一张脸是连载的生命线 */
export const nextEpisodeSchema = z.object({
  synopsis: z.string().min(10).max(500),
  title: z.string().max(80).optional(),
  cloneAssets: z.boolean().default(true),
});

/** 系列级批量提交：video = 逐集渲染待拍镜头；portrait = 补全缺失定妆图；voiceover = 逐集补台词配音 */
export const batchRenderSchema = z.object({
  kind: z.enum(["video", "portrait", "voiceover"]).default("video"),
});
