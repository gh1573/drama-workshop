"use client";

import { useState } from "react";
import { Check, ChevronDown, Lightbulb, Music, Sparkles, Zap } from "lucide-react";
import { GENRES } from "@/lib/genres";
import { useWorkbench } from "@/store/workbench";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StepCard } from "./step-card";
import { GENRE_ICONS } from "./genre-icons";

/** 第一步 · 题材选择（含题材 preset 详情联动） */
export function GenrePanel() {
  const genreId = useWorkbench((s) => s.genreId);
  const selectGenre = useWorkbench((s) => s.selectGenre);
  const genre = GENRES.find((g) => g.id === genreId) ?? GENRES[0];
  /* v2.6 VLM 复审：EN 影调锚点属高级配置，默认折叠——
     既修复「黑底英文块与策略文案层级混沉」，也压缩左栏垂直空间让梗概输入更近首屏 */
  const [toneOpen, setToneOpen] = useState(false);

  return (
    <StepCard title="选择题材" icon={<Lightbulb className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-2">
        {GENRES.map((g) => {
          const active = g.id === genreId;
          const Icon = GENRE_ICONS[g.icon] ?? Sparkles;
          return (
            <button
              key={g.id}
              onClick={() => selectGenre(g.id)}
              aria-pressed={active}
              className={`group flex flex-col gap-1.5 rounded-xl p-2.5 text-left transition-all duration-200 ${
              /* v2.8 VLM 复审：选中态从四重强调（描边+浅底+阴影+图标染色+文案染色）
                   精简为两重（描边 + 勾选）——题材辨识靠图标与文案，彩色面积让位主 CTA */
                active
                  ? "border border-amber-500/60 bg-secondary/40"
                  : "border border-border/80 bg-secondary/40 hover:border-muted-foreground/40 hover:bg-secondary/60"
              }`}
            >
              <span className="flex items-center justify-between">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                    active
                      ? "bg-secondary/80 text-foreground"
                      : "bg-secondary/80 text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {active && <Check className="h-3.5 w-3.5 text-amber-400" />}
              </span>
              <span
                className={`text-sm font-semibold leading-tight ${
                  active ? "text-foreground" : ""
                }`}
              >
                {g.short}
              </span>
              <span
                className="text-[10px] leading-snug text-muted-foreground"
              >
                {g.badge}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5 rounded-lg border border-border/70 bg-secondary/30 p-3.5">
        <p className="flex gap-2">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="text-xs leading-relaxed">
            <span className="font-semibold text-amber-400">钩子策略：</span>
            {genre.hookTactic}
          </span>
        </p>
        <p className="flex gap-2">
          <Music className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="text-xs leading-relaxed">
            <span className="font-semibold text-amber-400">配乐音效：</span>
            {genre.musicMood}
          </span>
        </p>
        {/* v2.6：AI 影调锚点改为折叠高级区（默认收起） */}
        <Collapsible open={toneOpen} onOpenChange={setToneOpen}>
          <CollapsibleTrigger
            className="flex w-full items-center gap-1.5 text-left text-[10px] font-semibold tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${toneOpen ? "" : "-rotate-90"}`}
            />
            高级 · AI 影调锚点（EN）
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1.5 rounded-md border border-border/60 bg-black/30 px-2.5 py-2">
              <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                {genre.tonePrompt}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </StepCard>
  );
}
