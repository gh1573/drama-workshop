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

export const storyBeatSchema = z.object({
  index: z.number().int().min(1).max(99),
  actTitle: z.string().min(1).max(120),
  narrativeFunction: z.enum(["hook", "climax", "cliffhanger"]),
  pacingNote: z.string().min(1).max(200),
  description: z.string().min(1).max(600),
  dialogueSubtitle: z.string().min(1).max(120),
  cameraMovement: z.string().min(1).max(40),
  promptGuidance: z.string().min(1).max(600),
});

export const saveProjectSchema = z.object({
  title: z.string().max(80).optional(),
  genre: z.object({
    id: z.string().min(1).max(40),
    name: z.string().min(1).max(60),
    badge: z.string().min(1).max(60),
    hookTactic: z.string().min(1).max(300),
    musicMood: z.string().min(1).max(200),
    tonePrompt: z.string().min(1).max(500),
  }),
  synopsis: z.string().min(10).max(500),
  modelConfig: modelConfigSchema,
  storyBeats: z.array(storyBeatSchema).length(3),
  status: z.enum(["draft", "beatsReady", "inProduction", "archived"]).optional(),
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
});

export const reorderClipsSchema = z.object({
  clipIds: z.array(z.string().min(1)).min(1).max(99),
});

/** zod 校验失败 → 人类可读错误信息 */
export function firstZodError(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "入参校验失败";
  const path = issue.path.join(".");
  return `参数 ${path || "(root)"} 校验失败：${issue.message}`;
}
