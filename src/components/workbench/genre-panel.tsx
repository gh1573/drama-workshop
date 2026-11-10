"use client";

import { Lightbulb, Music, Palette, Zap } from "lucide-react";
import { GENRES } from "@/lib/genres";
import { useWorkbench } from "@/store/workbench";
import { StepCard } from "./step-card";

/** 第一步 · 题材选择（含题材 preset 详情联动） */
export function GenrePanel() {
  const genreId = useWorkbench((s) => s.genreId);
  const selectGenre = useWorkbench((s) => s.selectGenre);
  const genre = GENRES.find((g) => g.id === genreId) ?? GENRES[0];

  return (
    <StepCard step="第一步" title="选择题材" icon={<Lightbulb className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
        {GENRES.map((g) => {
          const active = g.id === genreId;
          return (
            <button
              key={g.id}
              onClick={() => selectGenre(g.id)}
              aria-pressed={active}
              className={`group rounded-xl border text-left transition-all ${
                active
                  ? `border-transparent bg-gradient-to-br ${g.gradient} p-[1.5px] shadow-lg`
                  : "border-border bg-secondary/40 hover:border-muted-foreground/40"
              }`}
            >
              <span
                className={`flex h-full flex-col gap-1 rounded-[10px] ${
                  active ? "bg-card px-2.5 py-2.5" : ""
                }`}
              >
                <span className="text-lg">{g.icon}</span>
                <span className="text-sm font-bold leading-tight">{g.short}</span>
                <span
                  className={`text-[10px] leading-tight ${
                    active ? g.text : "text-muted-foreground"
                  }`}
                >
                  {g.badge}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 rounded-lg border border-border/70 bg-secondary/30 p-3 text-xs">
        <p className="flex gap-2">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>
            <span className="font-semibold text-amber-400">钩子策略：</span>
            {genre.hookTactic}
          </span>
        </p>
        <p className="flex gap-2">
          <Music className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span>
            <span className="font-semibold text-rose-400">配乐音效：</span>
            {genre.musicMood}
          </span>
        </p>
        <p className="flex gap-2">
          <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span>
            <span className="font-semibold text-emerald-400">影调锚点：</span>
            <span className="font-mono text-[10px] leading-relaxed text-muted-foreground">
              {genre.tonePrompt}
            </span>
          </span>
        </p>
      </div>
    </StepCard>
  );
}
