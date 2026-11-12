import type { NarrativeFunction } from "@/lib/drama";

/**
 * 产品版本徽标（顶栏）——单一出处，改版必改此处；
 * 与 docs/architecture-v2.md 头部版本号、变更记录同步（禁止硬编码散落导致口径漂移）。
 */
export const APP_VERSION = "v2.9.4";

/**
 * v2.8 设计令牌（视图层单一来源）
 *
 * 色彩纪律（VLM 走查 6/10 分诊断后的收敛规则）：
 * 1. 品牌色唯一 —— red-600 → rose-600 → amber-500 暖色轴，只用于 logo / 主 CTA / 品牌时刻；
 * 2. 叙事功能色 = 品牌暖色轴上的五档采样（此前 amber/sky/fuchsia/rose/emerald 五色虹彩被判失控）；
 * 3. 语义色三枚 —— emerald=就绪/成功，amber=运行/警示，red/rose=危险/失败；
 * 4. 其余一律灰阶（border / muted / secondary）。
 *
 * 本文件是「场次叙事功能」配色的唯一出处：
 * act-card（场次卡）与 rhythm-panel（节奏轨）必须同源引用，禁止两处各自定义导致口径漂移。
 */

/** 叙事功能 → 品牌暖色轴五档（能量自低到高：amber → orange → rose → red） */
export const FN_TONE: Record<
  NarrativeFunction,
  {
    /** 徽标：描边 + 浅底 + 文字 */
    badgeCls: string;
    /** 能量条 / 图例渐变（卡顶 1px 条、节奏轨 FN 段） */
    barCls: string;
    /** 金句引用块：仅左描边（中性底 bg-secondary/30 由卡片提供——v2.8 P1 降噪：单卡彩色焦点从 5 处减至 3 处） */
    quoteCls: string;
    /** 实心圆点（图例 / 时间线分组点） */
    solidCls: string;
  }
> = {
  hook: {
    badgeCls: "border-red-500/40 bg-red-500/10 text-red-400",
    barCls: "bg-gradient-to-r from-red-500 to-orange-500",
    quoteCls: "border-red-400/70",
    solidCls: "bg-red-500",
  },
  buildup: {
    badgeCls: "border-orange-500/40 bg-orange-500/10 text-orange-400",
    barCls: "bg-gradient-to-r from-orange-500 to-amber-500",
    quoteCls: "border-orange-400/70",
    solidCls: "bg-orange-500",
  },
  twist: {
    badgeCls: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    barCls: "bg-gradient-to-r from-rose-500 to-orange-500",
    quoteCls: "border-rose-400/70",
    solidCls: "bg-rose-500",
  },
  climax: {
    badgeCls: "border-red-500/60 bg-red-500/20 text-red-300",
    barCls: "bg-gradient-to-r from-red-600 to-rose-600",
    quoteCls: "border-red-400/80",
    solidCls: "bg-red-600",
  },
  cliffhanger: {
    badgeCls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    barCls: "bg-gradient-to-r from-amber-500 to-yellow-500",
    quoteCls: "border-amber-400/70",
    solidCls: "bg-amber-500",
  },
};

/** 语义状态色（徽标三件套；info 走灰阶而非引入第四色相） */
export const SEM_TONE = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  danger: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  info: "border-border/70 bg-secondary/40 text-muted-foreground",
} as const;

/** 品牌渐变（仅 logo / 主 CTA / 品牌时刻；大面积使用前先自问是否让位主 CTA） */
export const BRAND = {
  gradient: "bg-gradient-to-r from-red-600 via-rose-600 to-amber-500",
  gradientSoft: "bg-gradient-to-r from-red-600/70 to-amber-500/70",
  accent: "text-amber-400",
} as const;
