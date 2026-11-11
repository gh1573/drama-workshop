"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  Play,
  RefreshCw,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useWorkbench } from "@/store/workbench";

/**
 * 成片面板（v2.4 §7.9）—— 「一键成片」的结果出口。
 * 三态：待渲染（一键渲染全片）→ 渲染中（进度 + 自动合成）→ 成片（播放器 + 下载/重合成）。
 * 全部镜头就绪且尚未合成时自动触发合成（失败需手动重试，避免死循环）。
 */
export function FinalCutPanel() {
  const { toast } = useToast();
  const clips = useWorkbench((s) => s.session?.clips ?? []);
  const finalVideoUrl = useWorkbench((s) => s.session?.finalVideoUrl ?? null);
  const tasks = useWorkbench((s) => s.tasks);
  const composing = useWorkbench((s) => s.composing);
  const renderAll = useWorkbench((s) => s.renderAll);
  const composeEpisode = useWorkbench((s) => s.composeEpisode);
  const fetchTasks = useWorkbench((s) => s.fetchTasks);

  const [composeError, setComposeError] = useState<string | null>(null);
  const composingRef = useRef(false);
  composingRef.current = composing;

  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const total = sorted.length;
  const readyCount = sorted.filter(
    (c) => c.status === "ready" && c.mediaUrl
  ).length;
  const pendingCount = total - readyCount;
  const allReady = total > 0 && readyCount === total;
  const activeVideoTasks = tasks.filter(
    (t) =>
      t.kind === "video" && (t.status === "queued" || t.status === "running")
  ).length;
  const failedVideoTasks = tasks.filter(
    (t) => t.kind === "video" && t.status === "failed"
  );
  const renderProgress = total > 0 ? Math.round((readyCount / total) * 100) : 0;

  // 渲染进行中保持任务轮询（复用 store 的链式轮询）
  useEffect(() => {
    if (activeVideoTasks > 0) void fetchTasks();
  }, [activeVideoTasks, fetchTasks]);

  // 自动合成：全部就绪 + 未合成 + 非合成中 + 上次自动合成没有失败
  useEffect(() => {
    if (allReady && !finalVideoUrl && !composingRef.current && !composeError) {
      void (async () => {
        const err = await composeEpisode();
        if (err) {
          setComposeError(err);
          toast({
            title: "自动合成未完成",
            description: err,
            variant: "destructive",
          });
        } else {
          toast({ title: "成片已就绪 🎬", description: "可在下方播放器直接看片" });
        }
      })();
    }
  }, [allReady, finalVideoUrl, composeError, composeEpisode, toast]);

  async function handleRenderAll() {
    setComposeError(null);
    const okDone = await renderAll();
    if (okDone) {
      toast({
        title: "全片渲染已提交 🎬",
        description: "视频 + 配音任务已进入渲染队列，进度将实时更新",
      });
    } else {
      toast({
        title: "提交失败",
        description: "请确认项目已立项且镜头完成锚定",
        variant: "destructive",
      });
    }
  }

  async function handleCompose() {
    setComposeError(null);
    const err = await composeEpisode();
    if (err) {
      setComposeError(err);
      toast({ title: "合成失败", description: err, variant: "destructive" });
    } else {
      toast({ title: "成片已就绪 🎬", description: "可在下方播放器直接看片" });
    }
  }

  if (total === 0) return null;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Film className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold tracking-wide">成片 · 第 1 集</h3>
        {finalVideoUrl ? (
          <Badge
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-400"
          >
            已合成
          </Badge>
        ) : allReady ? (
          <Badge
            variant="outline"
            className="border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-400"
          >
            镜头就绪 · 待合成
          </Badge>
        ) : activeVideoTasks > 0 ? (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-400"
          >
            渲染中 {activeVideoTasks} 镜在途
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-zinc-500/40 text-[10px] text-zinc-400"
          >
            待渲染
          </Badge>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {readyCount}/{total} 镜就绪 · 约{" "}
          {Math.round(
            sorted.reduce((m, c) => m + (c.plannedMs ?? 0), 0) / 1000
          )}
          s
        </span>
      </div>

      {/* —— 播放器 / 占位 —— */}
      <div className="flex justify-center">
        {finalVideoUrl ? (
          <video
            key={finalVideoUrl}
            src={finalVideoUrl}
            controls
            playsInline
            className="max-h-[560px] w-auto max-w-full rounded-xl border border-border/70 bg-black shadow-2xl"
          />
        ) : (
          <div className="flex aspect-[9/16] w-full max-w-[315px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/70 bg-gradient-to-b from-red-600/5 via-transparent to-amber-500/10 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/60">
              {composing ? (
                <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
              ) : (
                <Play className="h-7 w-7 text-muted-foreground/70" />
              )}
            </div>
            <p className="text-sm font-semibold">
              {composing
                ? "正在合成成片（片头卡 · 字幕 · 配音）…"
                : allReady
                  ? "镜头全部就绪，正在自动合成成片…"
                  : "渲染完成后这里直接看片"}
            </p>
            <p className="text-xs text-muted-foreground">
              {composing
                ? "ffmpeg 合成约需数十秒，请稍候"
                : allReady
                  ? "合成完成后自动播放"
                  : `还差 ${pendingCount} 个镜头出片`}
            </p>
            {renderProgress > 0 && !allReady && (
              <div className="w-full max-w-56 space-y-1">
                <Progress value={renderProgress} className="h-1.5" />
                <p className="font-mono text-[10px] text-muted-foreground">
                  渲染进度 {renderProgress}%
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* —— 操作区 —— */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        {!finalVideoUrl && !allReady && activeVideoTasks === 0 && (
          <Button
            onClick={handleRenderAll}
            className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 font-bold text-white hover:opacity-90"
          >
            <Video className="h-4 w-4" />
            一键渲染全片（{pendingCount} 镜 + 配音）
          </Button>
        )}
        {activeVideoTasks > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            视频通道渲染中（每镜约 60~90s，完成后自动合成）
          </p>
        )}
        {allReady && !finalVideoUrl && (
          <Button
            variant="outline"
            disabled={composing}
            onClick={handleCompose}
            className="border-sky-500/40 bg-sky-500/10 font-semibold text-sky-400 hover:bg-sky-500/20"
          >
            {composing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            重新合成成片
          </Button>
        )}
        {finalVideoUrl && (
          <>
            <a href={finalVideoUrl} download target="_blank" rel="noreferrer">
              <Button
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 font-semibold text-emerald-400 hover:bg-emerald-500/20"
              >
                <Download className="h-4 w-4" />
                下载成片 MP4
              </Button>
            </a>
            <Button
              variant="outline"
              disabled={composing}
              onClick={handleCompose}
              className="border-border/70 text-xs hover:bg-secondary/40"
            >
              {composing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              镜头有改动？重新合成
            </Button>
          </>
        )}

        {/* 失败提示 */}
        {failedVideoTasks.length > 0 && !finalVideoUrl && (
          <p className="flex items-center gap-1.5 text-xs text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {failedVideoTasks.length} 个渲染任务失败，可在「剧组进程」页签重试后再次渲染
          </p>
        )}
        {composeError && (
          <p className="flex items-center gap-1.5 text-xs text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {composeError}
            <button
              onClick={() => setComposeError(null)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              重试
            </button>
          </p>
        )}
        {finalVideoUrl && allReady && (
          <p className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            片头卡 + 字幕烧录 + 配音混音 已合入成片
          </p>
        )}
      </div>
    </section>
  );
}
