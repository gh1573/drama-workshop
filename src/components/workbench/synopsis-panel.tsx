"use client";

import { Wand, Film, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GENRES } from "@/lib/genres";
import { useWorkbench } from "@/store/workbench";
import { StepCard } from "./step-card";

/** 梗概就绪阈值（与开机校验同源：trim 后 ≥10 字） */
export const SYNOPSIS_MIN = 10;

/** 第二步 · 剧情梗概输入 */
export function SynopsisPanel() {
  const synopsis = useWorkbench((s) => s.synopsis);
  const setSynopsis = useWorkbench((s) => s.setSynopsis);
  const genreId = useWorkbench((s) => s.genreId);
  const genre = GENRES.find((g) => g.id === genreId) ?? GENRES[0];
  /* v2.9.6（VLM 首屏转化走查 8 视图高频缺口：「填完梗概页面无就绪信号」，
     用户不知道现在能不能开机）——就绪信号放在输入现场，≥10 字变绿 */
  const ready = synopsis.trim().length >= SYNOPSIS_MIN;

  return (
    <StepCard title="剧情梗概" icon={<Film className="h-4 w-4" />}>
      <Textarea
        id="synopsis-input"
        value={synopsis}
        onChange={(e) => setSynopsis(e.target.value)}
        placeholder={`输入你的故事梗概（10~500 字）……\n例如：${genre.sampleSynopsis}`}
        className="min-h-28 resize-none border-border/70 bg-secondary/30 text-sm leading-relaxed"
      />
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSynopsis(genre.sampleSynopsis)}
          className="border-amber-500/40 text-xs text-amber-400 hover:bg-amber-500/10"
        >
          <Wand className="h-3.5 w-3.5" />
          填充示例梗概
        </Button>
        {ready ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            梗概就绪 · 可开机
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{synopsis.length}/500 字</span>
        )}
      </div>
    </StepCard>
  );
}
