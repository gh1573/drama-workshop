"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Check,
  Clapperboard,
  FolderOpen,
  Gauge,
  Layers,
  Film,
  Loader2,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GenrePanel } from "@/components/workbench/genre-panel";
import { SynopsisPanel } from "@/components/workbench/synopsis-panel";
import { ModelConfigPanel } from "@/components/workbench/model-config-panel";
import { ActCard } from "@/components/workbench/act-card";
import { TimelinePanel } from "@/components/workbench/timeline-panel";
import { RhythmPanel } from "@/components/workbench/rhythm-panel";
import { CrewPipelinePanel } from "@/components/workbench/crew-pipeline-panel";
import { AssetLibraryPanel } from "@/components/workbench/asset-library-panel";
import { FinalCutPanel } from "@/components/workbench/final-cut-panel";
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

type WorkbenchTab = "cut" | "script" | "assets" | "rhythm" | "pipeline";

export default function Home() {
  const { toast } = useToast();
  const session = useWorkbench((s) => s.session);
  const generating = useWorkbench((s) => s.generating);
  const generatingStep = useWorkbench((s) => s.generatingStep);
  const generate = useWorkbench((s) => s.generate);
  const synopsis = useWorkbench((s) => s.synopsis);
  const setLibraryOpen = useWorkbench((s) => s.setLibraryOpen);
  // —— v2 剧组流水线 ——
  const activeRun = useWorkbench((s) => s.activeRun);
  const pipelineStarting = useWorkbench((s) => s.pipelineStarting);
  const startPipeline = useWorkbench((s) => s.startPipeline);

  // 工作台页签：流水线运行中自动切「剧组进程」，成功后自动切「成片」
  const [tab, setTab] = useState<WorkbenchTab>("cut");
  const runStatus = activeRun?.status ?? null;
  useEffect(() => {
    if (runStatus === "running") setTab("pipeline");
    else if (runStatus === "succeeded") setTab("cut");
  }, [runStatus]);

  // v2.4.1 §7.10：页签切换重置右列内滚位置，避免新页签停在旧滚动深处
  const workColRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    workColRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  // 开机后左列配置自动折叠
  const [configOpen, setConfigOpen] = useState(true);
  const hasSession = !!session;
  useEffect(() => {
    if (hasSession) setConfigOpen(false);
  }, [hasSession]);

  const pipelineRunning = activeRun?.status === "running";

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
      setTab("script");
      toast({ title: "分镜推演完成", description: "三幕结构已生成，可保存到项目库或导出" });
    } else {
      toast({
        title: "生成失败",
        description: useWorkbench.getState().lastError ?? "请稍后重试或调整梗概",
        variant: "destructive",
      });
    }
  }

  /** 全组开机：立项（如未立项）→ 启动剧组流水线 → 轮询观测 */
  async function handleStartPipeline() {
    if (synopsis.trim().length < 10) {
      toast({
        title: "梗概太短",
        description: "请输入至少 10 个字的剧情梗概，或点击「填充示例梗概」",
        variant: "destructive",
      });
      return;
    }
    const ok = await startPipeline();
    if (ok) {
      toast({
        title: "剧组已开机 🎬",
        description: "编剧 → 选角定妆 → 导演拆镜 → 场记锚定 → 后期成包，进度见「剧组进程」页签",
      });
    } else {
      toast({
        title: "开机失败",
        description: useWorkbench.getState().lastError ?? "请稍后重试或调整梗概",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-background text-foreground lg:h-dvh lg:min-h-0 lg:overflow-hidden">
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
                剧本推演 · 镜头编排 · 一键成片
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

      {/* v2.4.1 §7.10：桌面端锁定视口，main 占满剩余高度且不滚动，双列各自内滚 */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:min-h-0 lg:overflow-hidden lg:py-4">
        <div className="grid gap-6 lg:grid-cols-12 lg:h-full lg:min-h-0">
          {/* ===== 左列：创作配置（开机后自动折叠） ===== */}
          <div className="space-y-5 lg:col-span-4 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            {hasSession && (
              <Collapsible
                open={configOpen}
                onOpenChange={setConfigOpen}
                className="rounded-xl border bg-card"
              >
                <div className="flex items-center gap-2 px-4 py-3">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <p className="flex-1 truncate text-sm font-bold">
                    {session!.title}
                  </p>
                  {pipelineRunning && activeRun && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-[10px] text-amber-400"
                    >
                      {activeRun.progress}%
                    </Badge>
                  )}
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      {configOpen ? "收起配置" : "调整题材/梗概"}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                {pipelineRunning && activeRun && (
                  <div className="px-4 pb-3">
                    <Progress value={activeRun.progress} className="h-1.5" />
                  </div>
                )}
                <CollapsibleContent className="space-y-5 border-t border-border/60 p-4">
                  <GenrePanel />
                  <SynopsisPanel />
                  <ModelConfigPanel />
                  <Button
                    size="lg"
                    disabled={pipelineRunning || pipelineStarting || synopsis.trim().length < 10}
                    onClick={handleStartPipeline}
                    className="h-12 w-full bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 text-sm font-bold text-white shadow-lg shadow-red-600/25 hover:opacity-90"
                  >
                    {pipelineRunning || pipelineStarting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        剧组拍摄中 {activeRun ? `· ${activeRun.progress}%` : "…"}
                      </>
                    ) : (
                      <>
                        <Clapperboard className="h-4 w-4" />
                        按新配置重新开机
                      </>
                    )}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            )}

            {!hasSession && (
              <div className="space-y-5">
                <GenrePanel />
                <SynopsisPanel />
                <ModelConfigPanel />
                <Button
                  size="lg"
                  disabled={pipelineRunning || pipelineStarting || synopsis.trim().length < 10}
                  onClick={handleStartPipeline}
                  className="h-14 w-full bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 text-base font-bold text-white shadow-xl shadow-red-600/25 hover:opacity-90"
                >
                  {pipelineRunning || pipelineStarting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      剧组拍摄中 {activeRun ? `· ${activeRun.progress}%` : "…"}
                    </>
                  ) : (
                    <>
                      <Clapperboard className="h-5 w-5" />
                      全组开机 · AI 剧组流水线
                    </>
                  )}
                </Button>

                {/* 副路径：仅快速推演三幕（不立项） */}
                <p className="text-center text-xs text-muted-foreground">
                  只想先试试剧本？
                  <button
                    onClick={handleGenerate}
                    disabled={generating || pipelineRunning}
                    className="mx-1 underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    仅快速推演三幕剧本（不立项）
                  </button>
                </p>

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
            )}

            {hasSession && <ProjectInfoCard />}
          </div>

          {/* ===== 右列：工作台页签（一次聚焦一个环节，内容内滚） ===== */}
          <div
            ref={workColRef}
            className="lg:col-span-8 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pl-1"
          >
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
                  选择题材 → 输入梗概 → 点击「全组开机」
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  剧组流水线自动完成：编剧三幕 → 选角定妆 → 导演拆镜 → 锚定组装 → 后期成包；
                  也可从「项目库」载入历史项目继续创作
                </p>
              </div>
            )}

            {!generating && session && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Tabs
                  value={tab}
                  onValueChange={(v) => setTab(v as WorkbenchTab)}
                  className="space-y-4"
                >
                  <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-secondary/40 p-1">
                    <TabsTrigger value="cut" className="gap-1.5 px-3 text-xs">
                      <Film className="h-3.5 w-3.5" />
                      成片
                      {session.finalVideoUrl && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="script" className="gap-1.5 px-3 text-xs">
                      <Layers className="h-3.5 w-3.5" />
                      分镜剧本
                    </TabsTrigger>
                    <TabsTrigger value="assets" className="gap-1.5 px-3 text-xs">
                      <Users className="h-3.5 w-3.5" />
                      资产定妆
                    </TabsTrigger>
                    <TabsTrigger value="rhythm" className="gap-1.5 px-3 text-xs">
                      <Gauge className="h-3.5 w-3.5" />
                      节奏轨道
                    </TabsTrigger>
                    <TabsTrigger value="pipeline" className="gap-1.5 px-3 text-xs">
                      <Workflow className="h-3.5 w-3.5" />
                      剧组进程
                      {pipelineRunning && (
                        <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="cut" className="mt-0 space-y-4">
                    <FinalCutPanel />
                    <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-muted-foreground">
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
                      渲染 → 合成 → 看片，一条流水线直达成片
                    </p>
                  </TabsContent>

                  <TabsContent value="script" className="mt-0 space-y-5">
                    {session.beats.map((beat, idx) => (
                      <ActCard key={beat.index} beat={beat} delay={idx * 0.08} />
                    ))}
                    <TimelinePanel />
                  </TabsContent>

                  <TabsContent value="assets" className="mt-0">
                    <AssetLibraryPanel />
                  </TabsContent>

                  <TabsContent value="rhythm" className="mt-0">
                    <RhythmPanel />
                  </TabsContent>

                  <TabsContent value="pipeline" className="mt-0">
                    <CrewPipelinePanel />
                  </TabsContent>
                </Tabs>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      <ProjectLibraryDrawer />

      {/* 页脚（移动端展示；桌面端锁定视口布局下隐藏，见 §7.10） */}
      <footer className="mt-auto border-t border-border/60 bg-background/60 lg:hidden">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1.5 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>制作团队：剧集智能创编工坊 (DRAMA STUDIO) · 本页为该工具的复刻实现，仅用于剧本创意推演</p>
          <p>三幕结构：Hook 黄金开头 → Clash 绝地反转 → Cliffhanger 卡点留钩</p>
        </div>
      </footer>
    </div>
  );
}
