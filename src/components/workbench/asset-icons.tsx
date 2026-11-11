import { Building2, Gift, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 资产类别 icon 键 → lucide 图标的共享映射（视图层）。
 * 数据层（drama.ts ASSET_KIND_META）的 icon 字段只存字符串键，避免 React 耦合；
 * 使用方直接做成员访问 `ASSET_ICONS[key] ?? UserRound`
 * （不要包一层函数返回组件——会触发 react-hooks/static-components 规则）。
 */
export const ASSET_ICONS: Record<string, LucideIcon> = {
  user: UserRound,
  city: Building2,
  gift: Gift,
};
