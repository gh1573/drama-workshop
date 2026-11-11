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

/**
 * 角色文化一致性（v2.4.1，docs §7.1 第 5 条）：题材库全部为国内短剧题材，
 * 全链路强制单一文化面孔。三道防线共用本组常量，调整文化设定只改这里：
 * - 防线一：CASTING_FACE_RULE 写入选角提示词（LLM 遵守是期望，不是保证）；
 * - 防线二：run-service.parseCasting 用 ETHNICITY_KEYWORDS 校验锚点，
 *   缺失时追加 ETHNICITY_FALLBACK（确定性兜底，不信任 LLM）；
 * - 防线三：定妆提示词尾缀注入正 + 负向双向约束。
 */
/** 正向约束（写入定妆提示词与选角铁律） */
export const CHARACTER_ETHNICITY_POSITIVE =
  "Chinese actors, natural east asian features";

/** 负向约束（写入定妆提示词，压制图像模型自由发挥） */
export const CHARACTER_ETHNICITY_NEGATIVE =
  "no western features, no caucasian face";

/** 兜底注入词（锚点缺 ethnicity 时追加到描述末尾） */
export const ETHNICITY_FALLBACK = "Chinese";

/** ethnicity 关键词（大小写不敏感匹配 visualAnchor；命中任一即视为已含人种描述） */
export const ETHNICITY_KEYWORDS = ["chinese", "east asian", "asian"];

/**
 * 角色定妆专用尾缀（v2.4 → v2.4.1）：由正负双向约束组合而成，
 * 与选角阶段 CASTING_FACE_RULE 呼应，保证头像库不出欧美面孔。
 */
export const PORTRAIT_CHARACTER_TAIL = `${CHARACTER_ETHNICITY_POSITIVE}, ${CHARACTER_ETHNICITY_NEGATIVE}`;

/**
 * 选角面孔统一规则（v2.4，docs §7.1 第 5 条）：写入选角阶段提示词，
 * 要求全部角色锚点为华人面孔（题材库全部为国内短剧题材）。
 */
export const CASTING_FACE_RULE = `【面孔统一铁律】全部角色一律为华人面孔（${CHARACTER_ETHNICITY_POSITIVE}）；每个角色的 visualAnchor 必须含 ethnicity 描述（如 "Chinese male" / "Chinese woman"），严禁输出欧美或混血面孔描述（${CHARACTER_ETHNICITY_NEGATIVE}）；中文定妆描述同步体现国人特征。`;

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

/**
 * 拆镜规格（导演阶段提示词参数，决定单集总时长档位）。
 * 精简档（v2.4 默认）：每幕 3~4 镜 × 4~5s ≈ 整集约 40~60s（含片头卡），
 * 镜头量约 9~12 个，单集真实生成可在分钟级跑通。
 * 调整档位只改这里，提示词与解析上限自动跟随。
 */
export const BREAKDOWN_SPEC = {
  /** 每幕镜头数下限/上限 */
  shotsPerActMin: 3,
  shotsPerActMax: 4,
  /** 单镜时长（毫秒）下限/上限 */
  shotMsMin: 4000,
  shotMsMax: 5000,
  /** 单集目标总时长提示（写入拆镜提示词的目标语境，秒） */
  targetEpisodeSeconds: 60,
} as const;
