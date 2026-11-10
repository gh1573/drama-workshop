"use client";

import { Video } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ACT_MOVEMENT_POOLS,
  CAMERA_MOVEMENTS,
  cameraLabel,
  type NarrativeFunction,
} from "@/lib/drama";

/**
 * 运镜调度选择矩阵 —— 吸收原版 Flow 工具的交互式矩阵设计：
 * 点击运镜徽标弹出机位库网格，实时切换并显示英文生成 Prompt；
 * 本幕推荐池内机位高亮标注（★），池外可选但给出弱化样式。
 */

const FN_STAR: Record<NarrativeFunction, string> = {
  hook: "锁定/冲击",
  climax: "排场/压迫",
  cliffhanger: "炫技/悬念",
};

export function MovementMatrix({
  current,
  fn,
  onSelect,
  compact,
}: {
  current: string;
  /** 所属幕（决定推荐池）；镜头级传 null 表示全部等权 */
  fn: NarrativeFunction | null;
  onSelect: (movement: string) => void;
  compact?: boolean;
}) {
  const pool = fn ? ACT_MOVEMENT_POOLS[fn] : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="切换运镜机位"
          className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/70 bg-transparent text-xs font-medium transition-colors hover:border-amber-500/60 hover:text-amber-400 ${
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1"
          }`}
        >
          <Video className="h-3 w-3" />
          {cameraLabel(current)}
          <span className="text-[9px] opacity-60">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold tracking-wide">运镜机位调度矩阵</p>
          {fn && (
            <span className="text-[10px] text-muted-foreground">
              ★ 本幕推荐（{FN_STAR[fn]}）
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(CAMERA_MOVEMENTS).map(([key, mv]) => {
            const active = key === current;
            const recommended = pool?.includes(key) ?? false;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                title={mv.prompt}
                className={`rounded-md border px-2 py-1.5 text-left transition-colors ${
                  active
                    ? "border-amber-500/70 bg-amber-500/15 text-amber-300"
                    : recommended
                      ? "border-emerald-500/30 bg-emerald-500/5 text-foreground/90 hover:border-emerald-500/60"
                      : "border-border/60 bg-secondary/30 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1 text-xs font-semibold">
                  {recommended && <span className="text-emerald-400">★</span>}
                  {mv.label}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground">
                  {key} · {mv.prompt.split(",")[0]}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          切换后立即生效，英文机位指令将随导出工程注入视频生成 Prompt。
        </p>
      </PopoverContent>
    </Popover>
  );
}
