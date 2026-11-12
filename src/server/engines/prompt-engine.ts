import { createHash } from "node:crypto";
import {
  CAMERA_MOVEMENTS,
  SHOT_SIZE_PROMPTS,
  STATE_NOTE_PROMPTS,
} from "@/lib/drama";
import {
  PROMPT_SEGMENT_LABELS,
  PROMPT_TECHNICAL_TAIL,
} from "@/config/templates";

/**
 * 提示词组装管线（prompt-engine）—— 一致性锚定的执行核心。
 *
 * 铁律（docs/architecture-v2.md §7.2）：
 * - 纯函数、无 IO、禁止依赖请求上下文；
 * - 组装顺序固定：角色段 → 场景段 → 道具段 → 动作段 → 运镜段 → 影调段 → 技术段；
 * - 每个镜头的最终提示词由「资产锁定段 + 场景段 + 动作段 + 运镜段 + 影调段」
 *   确定性组装，禁止自由拼接 —— 角色「不换脸」靠同一份锚点串，不靠模型记忆。
 */

export interface PromptAssetRef {
  name: string;
  /** 资产的英文视觉锚点（Asset.visualAnchor，定稿冻结） */
  visualAnchor: string;
  /** 引用状态补充（可空）：如「负伤」「换官服」 */
  stateNote?: string | null;
}

export interface PromptInput {
  shot: {
    visualDesc: string;
    visualPrompt: string | null;
    cameraMovement: string | null;
    shotSize: string | null;
    subtitle: string;
  };
  characters: PromptAssetRef[];
  scene: PromptAssetRef | null;
  props: PromptAssetRef[];
  /** 题材影调锚点（GenrePreset.tonePrompt） */
  tonePrompt: string;
  aspectRatio: string;
  plannedMs: number | null;
  resolution: string;
}

export interface PromptSegments {
  characters: string;
  scene: string;
  props: string;
  action: string;
  camera: string;
  tone: string;
  technical: string;
}

export interface PromptOutput {
  finalPrompt: string;
  /** 锚点指纹：所有引用资产锚点 + 影调的 sha256 前 12 位 */
  fingerprint: string;
  segments: PromptSegments;
}

/**
 * 资产引用 → 提示词段：锚点 + 状态注记（v2.8.3 场记专业化）。
 * stateNote（如「负伤」「换官服」）是中文行话，命中 STATE_NOTE_PROMPTS
 * 高频状态表则确定性译为英文；未命中保留原文（双语基模可客）。
 */
function refToSegment(ref: PromptAssetRef): string {
  const state = ref.stateNote?.trim();
  if (!state) return ref.visualAnchor;
  const en = STATE_NOTE_PROMPTS[state];
  return en ? `${ref.visualAnchor} (${en})` : `${ref.visualAnchor} (${state})`;
}

/** 锚点指纹：资产锚点参与即计入（与引用顺序无关），叠加影调锚点 */
export function anchorFingerprint(
  refs: Array<{ visualAnchor: string }>,
  tonePrompt: string
): string {
  const anchors = refs
    .map((r) => r.visualAnchor.trim())
    .filter(Boolean)
    .sort()
    .join("|");
  return createHash("sha256")
    .update(`${anchors}::${tonePrompt}`)
    .digest("hex")
    .slice(0, 12);
}

export function composeVideoPrompt(input: PromptInput): PromptOutput {
  const { shot } = input;

  const segments: PromptSegments = {
    characters: input.characters.map(refToSegment).join("; "),
    scene: input.scene ? refToSegment(input.scene) : "",
    props: input.props.map(refToSegment).join("; "),
    action: (shot.visualPrompt?.trim() || shot.visualDesc.trim()) as string,
    camera:
      (shot.cameraMovement && CAMERA_MOVEMENTS[shot.cameraMovement]?.prompt) ||
      "",
    tone: input.tonePrompt.trim(),
    technical: [
      `vertical ${input.aspectRatio} format`,
      input.plannedMs ? `${Math.round(input.plannedMs / 100) / 10}s duration` : null,
      input.resolution,
      // 景别映射（v2.8.2/v2.8.3）：中文景别是行话，基模只懂英文电影术语；
      // 景深随景别走（特写浅景深/全景深焦）是摄影专业铁律
      (() => {
        if (!shot.shotSize) return null;
        const m =
          SHOT_SIZE_PROMPTS[
            shot.shotSize as keyof typeof SHOT_SIZE_PROMPTS
          ];
        return m ? `${m.framing} framing, ${m.depth}` : `${shot.shotSize} framing`;
      })(),
      PROMPT_TECHNICAL_TAIL,
    ]
      .filter(Boolean)
      .join(", "),
  };

  const L = PROMPT_SEGMENT_LABELS;
  const finalPrompt = [
    segments.characters && `[${L.characters}] ${segments.characters}`,
    segments.scene && `[${L.scene}] ${segments.scene}`,
    segments.props && `[${L.props}] ${segments.props}`,
    `[${L.action}] ${segments.action}`,
    segments.camera && `[${L.camera}] ${segments.camera}`,
    segments.tone && `[${L.style}] ${segments.tone}`,
    `[${L.technical}] ${segments.technical}`,
  ]
    .filter(Boolean)
    .join(" ");

  const fingerprint = anchorFingerprint(
    [...input.characters, ...(input.scene ? [input.scene] : []), ...input.props],
    input.tonePrompt
  );

  return { finalPrompt, fingerprint, segments };
}
