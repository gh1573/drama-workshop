import {
  Drama,
  Flower2,
  Hourglass,
  Landmark,
  Search,
  Sparkles,
  Swords,
  Wallet,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 题材 icon 键 → lucide 图标的共享映射（视图层）。
 * 数据层（src/lib/genres.ts）的 icon 字段只存字符串键，避免 React 耦合；
 * 使用方直接做成员访问 `GENRE_ICONS[key] ?? Sparkles`
 * （不要包一层函数返回组件——会触发 react-hooks/static-components 规则）。
 */
export const GENRE_ICONS: Record<string, LucideIcon> = {
  swords: Swords,
  flower: Flower2,
  hourglass: Hourglass,
  search: Search,
  landmark: Landmark,
  wallet: Wallet,
  wine: Wine,
  drama: Drama,
};
