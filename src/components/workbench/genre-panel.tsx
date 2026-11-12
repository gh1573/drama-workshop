"use client";

import { Check, Lightbulb, Music, Sparkles, Zap } from "lucide-react";
import { GENRES } from "@/lib/genres";
import { useWorkbench } from "@/store/workbench";
import { StepCard } from "./step-card";
import { GENRE_ICONS } from "./genre-icons";

/** 第一步 · 题材选择（含题材 preset 详情联动） */
export function GenrePanel() {
  const genreId = useWorkbench((s) => s.genreId);
  const selectGenre = useWorkbench((s) => s.selectGenre);
  const genre = GENRES.find((g) => g.id === genreId) ?? GENRES[0];

  return (
    <StepCard step="01" title="选择题材" icon={<Lightbulb className="h-4 w-4" />}>
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
                active
                  ? `bg-gradient-to-br ${g.gradient} shadow-lg`
                  : "border border-border/80 bg-secondary/40 hover:border-muted-foreground/40 hover:bg-secondary/60"
              }`}
            >
              <span className="flex items-center justify-between">
                {/* §7.13：未选中态图标中性灰，题材身份色仅保留在选中态（内容色） */}
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-secondary/80 text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {active && <Check className="h-3.5 w-3.5 text-white/90" />}
              </span>
              <span
                className={`text-sm font-semibold leading-tight ${
                  active ? "text-white" : ""
                }`}
              >
                {g.short}
              </span>
              <span
                className={`text-[10px] leading-snug ${
                  active ? "text-white/80" : "text-muted-foreground"
                }`}
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
        <div className="rounded-md border border-border/60 bg-black/30 px-2.5 py-2">
          <p className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground">
            AI 影调锚点 · EN
          </p>
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            {genre.tonePrompt}
          </p>
        </div>
      </div>
    </StepCard>
  );
}
