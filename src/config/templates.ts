import type { AssetKind } from "@/lib/drama";
import type { ImageSize } from "@/server/providers";

/**
 * 模板文案配置（docs/architecture-v2.md §7.8 · L3 层）
 *
 * 定妆图规格、定妆提示词模板、视频提示词分段标签等技术文案集中于此；
 * 调整文案/规格只改本文件，不改业务代码。尺寸取值受 ImageSize 联合类型
 * 约束（编译期校验），超出通道支持范围会直接编译报错。
 */

/** 定妆图规格：尺寸 + 提示词开头模板 */
export interface PortraitSpec {
  /** 生成尺寸（通道支持的 ImageSize） */
  size: ImageSize;
  /** 提示词开头模板（说明画面用途，后接视觉锚点与影调） */
  promptPrefix: string;
}

/** 资产类型 → 定妆图规格 */
export const PORTRAIT_SPECS: Record<AssetKind, PortraitSpec> = {
  character: {
    size: "864x1152", // 3:4 竖幅定妆
    promptPrefix: "cinematic character portrait for a vertical short drama",
  },
  scene: {
    size: "1344x768", // 16:9 场景
    promptPrefix:
      "cinematic establishing shot of a location for a short drama",
  },
  prop: {
    size: "1024x1024", // 道具静物
    promptPrefix: "product-style prop still for a short drama",
  },
};

/** 定妆提示词公共尾缀（所有资产类型共用） */
export const PORTRAIT_PROMPT_TAIL =
  "dramatic lighting, highly detailed, consistent visual identity";

/** 视频提示词分段标签（组装顺序固定，标签文案可调） */
export const PROMPT_SEGMENT_LABELS = {
  characters: "Characters",
  scene: "Scene",
  props: "Props",
  action: "Action",
  camera: "Camera",
  style: "Style",
  technical: "Technical",
} as const;

/** 技术段固定尾缀（画质锚点） */
export const PROMPT_TECHNICAL_TAIL = "cinematic quality";
