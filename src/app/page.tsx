"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Check,
  Clapperboard,
  FolderOpen,
  Gauge,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GenrePanel } from "@/components/workbench/genre-panel";
import { SynopsisPanel } from "@/components/workbench/synopsis-panel";
import { ModelConfigPanel } from "@/components/workbench/model-config-panel";
import { ActCard } from "@/components/workbench/act-card";
import { TimelinePanel } from "@/components/workbench/timeline-panel";
import { RhythmPanel } from "@/components/workbench/rhythm-panel";
import { ProjectInfoCard } from "@/components/workbench/project-info-card";
import { ProjectLibraryDrawer } from "@/components/workbench/project-library-drawer";
import { useToast } from "@/hooks/use-toast";
import { useWorkbench } from "@/store/workbench";

const LOADING_STEPS = [
  "解析题材调性与钩子策略",
  "推演黄金 3 秒冲突开场",
  "编排中段绝地反转",
  "设计 12 秒悬念卡点",
  "打磨台词金句与画面提示",
];

export default function Home() {
  const { toast } = useToast();
  const session = useWorkbench((s) => s.session);
  const generating = useWorkbench((s) => s.generating);
  const generatingStep = useWorkbench((s) => s.generatingStep);
  const generate = useWorkbench((s) => s.generate);
  const synopsis = useWorkbench((s) => s.synopsis);
  const setLibraryOpen = useWorkbench((s) => s.setLibraryOpen);
  const outputNonce = useWorkbench((s) => s.outputNonce);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputNonce > 0) {
      outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [outputNonce]);

  useEffect(() => {
    if (!generating) return;
    const t = setInterval(
      () => useWorkbench.setState((s) => ({ generatingStep: (s.generatingStep + 1) % LOADING_STEPS.length })),
      2600
    );
    return () => clearInterval(t);
  }, [generating]);

  async function handleGenerate() {
    if (synopsis.trim().length < 10) {
      toast({
        title: "梗概太短",
        description: "请输入至少 10 个字的剧情梗概，或点击「填充示例梗概」",
        variant: "destructive",
      });
      return;
    }
    const ok = await generate();
    if (ok) {
      toast({ title: "分镜推演完成", description: "三幕结构已生成，可保存到项目库或导出" });
    } else {
      toast({
        title: "生成失败",
        description: useWorkbench.getState().lastError ?? "请稍后重试或调整梗概",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      {/* 氛围光效 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 -top-32 h-96 w-96 rounded-full bg-red-600/10 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-rose-600/10 blur-3xl" />
      </div>

      {/* 顶栏 */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 via-rose-600 to-amber-500 shadow-lg shadow-red-600/25">
              <Clapperboard className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-wide sm:text-lg">
                  剧集智能创编工坊
                </h1>
                <Badge
                  variant="outline"
                  className="hidden border-amber-500/40 text-amber-400 sm:inline-flex"
                >
                  DRAMA STUDIO v1.2.0
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                剧本推演 · 镜头编排 · 成片合成
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLibraryOpen(true)}
              className="border-border/70 text-xs"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              项目库
            </Button>
            <Badge className="hidden border-0 bg-gradient-to-r from-red-600/85 to-amber-500/85 text-white sm:inline-flex">
              9:16 竖屏短剧工作台
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* ===== 左列：创作配置 ===== */}
          <div className="space-y-6 lg:col-span-5">
            <GenrePanel />
            <SynopsisPanel />
            <ModelConfigPanel />

            <div className="space-y-3">
              <Button
                size="lg"
                disabled={generating || synopsis.trim().length < 10}
                onClick={handleGenerate}
                className="h-14 w-full bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 text-base font-bold text-white shadow-xl shadow-red-600/25 hover:opacity-90"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    AI 推演中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    开始生成分镜
                  </>
                )}
              </Button>

              {generating && (
                <div className="space-y-2 rounded-xl border bg-card p-4">
                  {LOADING_STEPS.map((s, i) => (
                    <div key={s} className="flex items-center gap-2 text-sm">
                      {i < generatingStep ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : i === generatingStep ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                      ) : (
                        <span className="mx-1 h-2 w-2 rounded-full bg-muted-foreground/40" />
                      )}
                      <span
                        className={
                          i <= generatingStep ? "text-foreground" : "text-muted-foreground"
                        }
                      >
                        {s}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ===== 右列：分镜产出与镜头轨 ===== */}
          <div ref={outputRef} className="scroll-mt-20 space-y-6 lg:col-span-7">
            {generating && (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
              </div>
            )}

            {!generating && !session && (
              <div className="flex min-h-[460px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/40 p-8 text-center">
                <div className="relative flex h-44 w-24 items-center justify-center rounded-2xl border-2 border-border/80 bg-gradient-to-b from-red-600/10 via-transparent to-amber-500/10">
                  <Sparkles className="h-8 w-8 text-amber-400/80" />
                  <span className="absolute bottom-2 text-[10px] text-muted-foreground">
                    9:16
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-bold">工作台准备就绪</h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  选择题材 → 输入梗概 → 点击「开始生成分镜」
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  生成后可保存项目、编排镜头轨，随时从「项目库」载入继续创作
                </p>
              </div>
            )}

            {!generating && session && (
              <motion.div
                key={outputNonce}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <ProjectInfoCard />
                {session.beats.map((beat, idx) => (
                  <ActCard key={beat.index} beat={beat} delay={idx * 0.1} />
                ))}
                <TimelinePanel />
                <RhythmPanel />

                <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-muted-foreground">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
                  满意就保存或导出，不满意改梗概再点一次「开始生成分镜」
                  <Gauge className="h-3.5 w-3.5 text-amber-400" />
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      <ProjectLibraryDrawer />

      {/* 页脚（吸底） */}
      <footer className="mt-auto border-t border-border/60 bg-background/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1.5 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>制作团队：剧集智能创编工坊 (DRAMA STUDIO) · 本页为该工具的复刻实现，仅用于剧本创意推演</p>
          <p>三幕结构：Hook 黄金开头 → Clash 绝地反转 → Cliffhanger 卡点留钩</p>
        </div>
      </footer>
    </div>
  );
}
