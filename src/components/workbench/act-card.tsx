"use client";

import { motion } from "framer-motion";
import { Clock, Copy, Loader2, Plus, Quote, Scissors, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CAMERA_MOVEMENTS,
  NARRATIVE_META,
  cameraLabel,
  type NarrativeFunction,
  type StoryBeat,
} from "@/lib/drama";
import { useWorkbench } from "@/store/workbench";
import { MovementMatrix } from "@/components/workbench/movement-matrix";

export const FN_STYLE: Record<
  NarrativeFunction,
  { badgeCls: string; barCls: string; quoteCls: string }
> = {
  hook: {
    badgeCls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    barCls: "from-amber-500 to-orange-500",
    quoteCls: "border-amber-400/70 bg-amber-500/10",
  },
  buildup: {
    badgeCls: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    barCls: "from-sky-500 to-blue-500",
    quoteCls: "border-sky-400/70 bg-sky-500/10",
  },
  twist: {
    badgeCls: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400",
    barCls: "from-fuchsia-500 to-purple-500",
    quoteCls: "border-fuchsia-400/70 bg-fuchsia-500/10",
  },
  climax: {
    badgeCls: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    barCls: "from-rose-500 to-red-500",
    quoteCls: "border-rose-400/70 bg-rose-500/10",
  },
  cliffhanger: {
    badgeCls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    barCls: "from-emerald-500 to-teal-500",
    quoteCls: "border-emerald-400/70 bg-emerald-500/10",
  },
};

/** 单场分镜卡：内容展示 + 台词复制 + 运镜调度矩阵 + AI 拆解分镜 + 加入镜头轨 */
export function ActCard({ beat, delay }: { beat: StoryBeat; delay: number }) {
  const { toast } = useToast();
  const fn = NARRATIVE_META[beat.narrativeFunction];
  const style = FN_STYLE[beat.narrativeFunction];
  const dbId = useWorkbench((s) => s.session?.dbId ?? null);
  const addClip = useWorkbench((s) => s.addClip);
  const setBeatMovement = useWorkbench((s) => s.setBeatMovement);
  const breakdownAct = useWorkbench((s) => s.breakdownAct);
  const breakingDown = useWorkbench((s) => s.breakingDown);
  const actClipCount = useWorkbench(
    (s) => s.session?.clips.filter((c) => c.beatIndex === beat.index).length ?? 0
  );
  // v2.5 状态真实化：就绪数按镜头轨聚合（替换硬编码「待生成」误导徽标）
  const actReadyCount = useWorkbench(
    (s) =>
      s.session?.clips.filter(
        (c) => c.beatIndex === beat.index && c.status === "ready"
      ).length ?? 0
  );
  const busy = breakingDown === beat.index;

  async function handleAdd() {
    const success = await addClip(beat.index);
    toast({
      title: success ? "已加入镜头轨" : "加入失败",
      description: success
        ? `第 ${String(beat.index).padStart(2, "0")} 场已追加到时间轨末尾`
        : "请先「保存到项目库」后再添加镜头片段",
      variant: success ? "default" : "destructive",
    });
  }

  async function handleBreakdown() {
    const err = await breakdownAct(beat.index);
    if (err) {
      toast({ title: "拆解未执行", description: err, variant: "destructive" });
    } else {
      toast({
        title: "分镜拆解完成",
        description: `第 ${String(beat.index).padStart(2, "0")} 场已拆为多个镜头并写入镜头轨，可在下方分镜表微调`,
      });
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className={`h-1 bg-gradient-to-r ${style.barCls}`} />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-gradient-to-r from-red-500 to-amber-500 bg-clip-text text-sm font-black tracking-wider text-transparent">
            【第 {String(beat.index).padStart(2, "0")} 场】
          </span>
          <h3 className="text-base font-bold">{beat.actTitle}</h3>
          <Badge variant="outline" className={`ml-auto ${style.badgeCls}`}>
            {fn.tag}
          </Badge>
        </div>

        <p className="flex gap-2 text-xs text-muted-foreground">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          {beat.pacingNote}
        </p>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">情节画面</p>
          <p className="text-sm leading-relaxed">{beat.description}</p>
        </div>

        <div
          className={`flex items-start gap-2.5 rounded-lg border-l-4 p-3 ${style.quoteCls}`}
        >
          <Quote className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
          <p className="flex-1 text-base font-bold leading-snug">
            {beat.dialogueSubtitle}
          </p>
          <button
            aria-label="复制台词"
            title="复制台词"
            onClick={() =>
              navigator.clipboard
                ?.writeText(beat.dialogueSubtitle)
                .then(() => toast({ title: "已复制到剪贴板" }))
                .catch(() => toast({ title: "复制失败", variant: "destructive" }))
            }
            className="rounded-md p-1.5 text-foreground/70 transition-colors hover:bg-background/60 hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MovementMatrix
            current={beat.cameraMovement}
            fn={beat.narrativeFunction}
            onSelect={(mv) => {
              setBeatMovement(beat.index, mv);
              toast({
                title: "运镜已切换",
                description: `${cameraLabel(mv)} · ${CAMERA_MOVEMENTS[mv]?.prompt ?? ""}`,
              });
            }}
          />
          <Badge variant="outline" className="border-border/70 text-xs">
            <Timer className="mr-1 h-3 w-3" />
            {actClipCount > 0
              ? `镜头产出：${actReadyCount}/${actClipCount} 就绪`
              : "镜头轨未拆解"}
          </Badge>
          {actClipCount > 0 && (
            <Badge
              variant="outline"
              className={`text-xs ${
                actReadyCount === actClipCount
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-400"
              }`}
            >
              {actReadyCount === actClipCount
                ? "全部就绪 · 可合成"
                : `待出片 ${actClipCount - actReadyCount} 镜`}
            </Badge>
          )}
          <button
            type="button"
            onClick={handleBreakdown}
            disabled={breakingDown !== null}
            className={`ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
              dbId
                ? "border-sky-500/50 text-sky-400 hover:bg-sky-500/10"
                : "border-border/70 text-muted-foreground hover:border-sky-500/50 hover:text-sky-400"
            }`}
          >
            {busy ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                AI 拆解中…
              </>
            ) : (
              <>
                <Scissors className="h-3 w-3" />
                AI 拆解分镜
              </>
            )}
          </button>
          <Badge
            variant="outline"
            role="button"
            tabIndex={0}
            onClick={handleAdd}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className={`cursor-pointer border-dashed text-xs transition-colors ${
              dbId
                ? "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                : "border-border/70 text-muted-foreground hover:border-rose-500/50 hover:text-rose-400"
            }`}
          >
            <Plus className="mr-1 h-3 w-3" />
            加入镜头轨
          </Badge>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
            画面提示补充
          </p>
          <p className="rounded-lg bg-black/30 p-3 font-mono text-xs leading-relaxed text-foreground/85">
            {beat.promptGuidance}
          </p>
        </div>
      </div>
    </motion.article>
  );
}
