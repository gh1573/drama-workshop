"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Anchor,
  BadgeCheck,
  Check,
  Clapperboard,
  FolderOpen,
  Gauge,
  History,
  Layers,
  Film,
  Loader2,
  Package,
  PenLine,
  PencilLine,
  Play,
  ScanFace,
  Scissors,
  Sparkles,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GenrePanel } from "@/components/workbench/genre-panel";
import { PipelineRail } from "@/components/workbench/pipeline-rail";
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
import { CREW_ROLES, RUN_STAGES, CAMERA_MOVEMENTS } from "@/lib/drama";
import { GENRES } from "@/lib/genres";
import { APP_VERSION } from "@/lib/ui/tokens";
import type { LucideIcon } from "lucide-react";

const LOADING_STEPS = [
  "解析题材调性与钩子策略",
  "推演黄金 3 秒冲突开场",
  "编排中段冲突升级与反转",
  "设计末场卡点留钩",
  "打磨台词金句与画面提示",
];

type WorkbenchTab = "cut" | "script" | "assets" | "rhythm" | "pipeline";

/** 流水线阶段 icon 映射（视图层；阶段数据在 drama.ts RUN_STAGES） */
const STAGE_ICONS: Record<string, LucideIcon> = {
  screenwriting: PenLine,
  casting: UserRound,
  directing: Clapperboard,
  anchoring: Anchor,
  postproduction: Scissors,
};

/** 开机前置亮点（§7.13 色彩纪律：中性卡 + 唯一 accent 卡，accent = 主转化目标） */
const VALUE_PROPS: Array<{
  icon: LucideIcon;
  title: string;
  desc: string;
  accent?: boolean;
}> = [
  {
    icon: Sparkles,
    title: "一键成片 · 直出 MP4",
    desc: "片头卡 + 字幕烧录 + 配音混音 + 转场调色，直出 9:16 竖屏成片",
    accent: true,
  },
  {
    icon: Layers,
    title: "系列连载 · 一键续集",
    desc: "续写下一集只需一句梗概，角色定妆与世界观跨集沿用",
  },
  {
    icon: Package,
    title: "制作包一键下载",
    desc: "成片 + 镜头素材 + 定妆图 + 分镜表 + 字幕 + 配音，ZIP 打包交付",
  },
  {
    icon: ScanFace,
    title: "定妆参考图注入",
    desc: "角色定妆照作为首帧参考提交视频通道，跨镜头面孔一致",
  },
  {
    icon: History,
    title: "断点恢复 · 限流自愈",
    desc: "阶段幂等推进，中断原地进行接力；429 指数退避错峰重试",
  },
];

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
  // （订阅状态迁移而非渲染期同步 setState，仅切换瞬间生效，用户手动切页不被覆盖）
  const [tab, setTab] = useState<WorkbenchTab>("cut");
  // §7.13 v2.5.2：重新开机为破坏性重写，需二次确认（VLM 审计 P1：与保存同视觉语言易误触）
  const [rerunConfirmOpen, setRerunConfirmOpen] = useState(false);
  useEffect(() => {
    const unsub = useWorkbench.subscribe((s, prev) => {
      const next = s.activeRun?.status ?? null;
      const before = prev.activeRun?.status ?? null;
      if (next === before) return;
      if (next === "running") setTab("pipeline");
      else if (next === "succeeded") setTab("cut");
    });
    return unsub;
  }, []);

  // v2.4.1 §7.10：页签切换重置右列内滚位置，避免新页签停在旧滚动深处
  const workColRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    workColRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  // 开机后左列配置自动折叠（订阅会话从无到有的迁移，用户可再次展开）
  const [configOpen, setConfigOpen] = useState(true);
  const hasSession = !!session;
  useEffect(() => {
    const unsub = useWorkbench.subscribe((s, prev) => {
      if (!prev.session && s.session) setConfigOpen(false);
    });
    return unsub;
  }, []);

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
      toast({ title: "分镜推演完成", description: "场次剧本已生成，可保存到项目库或导出" });
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
        title: "剧组已开机",
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
                  DRAMA STUDIO {APP_VERSION}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                剧本推演 · 镜头编排 · 一键成片
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLibraryOpen(true)}
                    className="border-border/70 text-xs"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    项目库
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  查看已立项项目 · 断点恢复 · 跨项目切换
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>

      {/* v2.4.1 §7.10：桌面端锁定视口，main 占满剩余高度且不滚动，双列各自内滚 */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:min-h-0 lg:overflow-hidden lg:py-4">
        <div className="grid gap-6 lg:grid-cols-12 lg:h-full lg:min-h-0">
          {/* ===== 左列：创作配置（开机后自动折叠） ===== */}
          <div className="space-y-4 lg:col-span-4 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1">
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
                  {/* §7.13 v2.5.2：破坏性重写 = 危险描边 + AlertDialog 二次确认，
                      与 amber 保存主 CTA 拉开语义（VLM 审计 P0） */}
                  <Button
                    size="lg"
                    /* v2.7.1：同空态主 CTA——不再因梗概长度灰化（校验与指引交给点击时 toast） */
                    disabled={generating || pipelineRunning || pipelineStarting}
                    onClick={() => setRerunConfirmOpen(true)}
                    className="h-12 w-full border border-red-500/40 bg-transparent text-sm font-bold text-red-300 shadow-none hover:bg-red-500/10 hover:text-red-200"
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
                  <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                    重新开机将重写当前项目的剧本、分镜与锚点（成片与任务记录保留）
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}

            {!hasSession && (
              <div className="space-y-4">
                <GenrePanel />
                <SynopsisPanel />
                <ModelConfigPanel />
                <Button
                  size="lg"
                  /* v2.7.1 VLM 走查修复：不再因梗概长度禁用主 CTA（灰化后“主操作隐形”
                      是空态双 P1 主因）——按钮始终醒目，点击时校验并 toast 指引 */
                  disabled={generating || pipelineRunning || pipelineStarting}
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

                {/* 副路径：仅快速推演场次剧本（不立项） */}
                <p className="text-center text-xs text-muted-foreground">
                  只想先试试剧本？
                  <button
                    onClick={handleGenerate}
                    disabled={generating || pipelineRunning}
                    className="mx-1 underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    仅快速推演场次剧本（不立项）
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
          {/* §7.13 v2.5.2：会话态右列整体作为「工作区底板」（全高圆角表面）——
              内容短于视口时不再是悬空卡片下的纯黑空洞，而是有边界的空工作面（IDE 惯例） */}
          <div
            ref={workColRef}
            className={`lg:col-span-8 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pl-1 ${
              session ? "lg:rounded-2xl lg:border lg:border-border/50 lg:bg-card/20 lg:p-3" : ""
            }`}
          >
            {generating && (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
              </div>
            )}

            {!generating && !session && (
              <section className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/50 p-5 sm:p-6">
                {/* —— 导览头部 —— */}
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-amber-500 shadow-lg shadow-red-600/20">
                    <Clapperboard className="h-4.5 w-4.5 text-white" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold tracking-wide">
                        AI 剧组 · 五阶段流水线
                      </h2>
                      {/* v2.8：双编号系统被 VLM 判混淆（左栏输入项 vs 本栏 01~05 阶段）——
                          编号语义唯一化后，再用徽标明确「左边是你配置，这边 AI 接手」 */}
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 bg-emerald-500/5 text-[10px] text-emerald-400"
                      >
                        全组开机后 AI 自动执行
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      左侧选择题材、输入梗概并「全组开机」，从一句创意到可下载的 9:16 成片全流程自动推进。
                    </p>
                  </div>
                </div>

                {/* —— 五阶段导览（数据驱动：RUN_STAGES × CREW_ROLES；§7.13 图标统一 amber） —— */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {RUN_STAGES.map((st, i) => {
                    const Icon = STAGE_ICONS[st.key] ?? Sparkles;
                    const role = CREW_ROLES[st.role as keyof typeof CREW_ROLES];
                    return (
                      <div
                        key={st.key}
                        className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-muted-foreground/30"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-muted-foreground/70">
                            0{i + 1}
                          </span>
                          <Icon className="h-4 w-4 text-amber-400/90" />
                        </div>
                        <p className="text-xs font-semibold leading-tight">{st.name}</p>
                        <p className="text-[10px] leading-snug text-muted-foreground">
                          {role?.duty}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* —— v2.9.2 可干预性声明（VLM 产品走查 7/11 视图高频缺口：
                    「全组开机=黑箱、不敢用于生产」）——流水线确有中间审校机制，
                    但空态只强调「自动执行」不讲「可干预」，把真实能力说没了 —— */}
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2.5">
                  <PencilLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    开机不是放手不管：每一阶段的产出（剧本 / 定妆图 / 分镜）都在工作台留档，
                    <span className="text-foreground">可改后继续</span>
                    ；改动角色或场景设定会自动标出受影响的镜头，
                    <span className="text-foreground">只补拍该补的</span>
                    ；中途失败从断点续跑，已完成阶段不重来。
                  </p>
                </div>

                {/* —— v2.8 P3（VLM 复审）：空态右栏缺显式开机入口，视线落点在预览器播放键上
                    ——在导览正下方补一枚次级开机 CTA（amber 实底，让位左栏品牌渐变主 CTA） —— */}
                <button
                  type="button"
                  onClick={handleStartPipeline}
                  disabled={generating || pipelineRunning || pipelineStarting}
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-amber-950 shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60"
                >
                  <Clapperboard className="h-4 w-4" />
                  全组开机 · 让 AI 剧组接管 01~05
                  <span className="font-mono text-[10px] font-medium opacity-70">
                    左侧选题材 · 输梗概即可
                  </span>
                </button>

                {/* —— 成片预览手机模型 × 能力亮点 ——
                    v2.8：去掉 grid flex-1 拉伸（VLM：右栏「上密—中空—下密」断层，
                    中段 300px+ 空洞源于 flex-1 把内容顶高、手机模型居中悬空） */}
                <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[200px,1fr]">
                  <div className="mx-auto flex w-full max-w-[200px] flex-col items-center gap-2.5">
                  <div className="relative flex aspect-[9/16] max-h-[380px] w-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black shadow-2xl">
                    {/* 弱光晕场景底 */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(239,68,68,0.18),transparent_60%)]" />
                    <div className="absolute left-1/2 top-2 z-10 h-1 w-14 -translate-x-1/2 rounded-full bg-white/10" />
                    <div className="absolute left-2.5 top-5 z-10 flex gap-1.5">
                      {/* v2.8：EP.01 / 1080p / PREVIEW 三组标签被 VLM 判冗余——只留 EP.01 */}
                      <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-white/80">
                        EP.01
                      </span>
                    </div>
                    <div className="pointer-events-none absolute right-2.5 top-5 z-10 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5">
                      <Play className="h-2.5 w-2.5 shrink-0 text-white/70" />
                      <span className="font-mono text-[9px] text-white/70">示例 · 实产</span>
                    </div>
                    {/* v2.9 信任实据（VLM 产品走查 P0：占位 mockup → 流水线实产示例成片，
                        点击即播——把「产品承诺」变成「可验证的演示」；
                        v2.9.1：示例成片已有配音与烧录字幕，不设 muted（无 autoplay 不受
                        浏览器静音策略约束），用户点播即得完整声画体验；
                        v2.9.2：补 poster 高燃帧——首帧是暗场片头卡，浏览器默认渲染
                        黑屏首帧，三轮 VLM 产品走查均误判「黑箱播放器/无内容」 */}
                    <video
                      src="/assets/final_cmwd6bk9k0000sj35v6cg1a9j.mp4"
                      poster="/assets/final_cmwd6bk9k0000sj35v6cg1a9j_poster.jpg"
                      controls
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 h-full w-full bg-black object-cover"
                    />
                  </div>
                  {/* §7.13：预览语境化 —— 从孤立装饰变为产品承诺 */}
                  <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                    示例成片可直接播放 · 开机后你的剧集同样直出
                    <br />
                    <span className="font-mono text-muted-foreground/70">
                      片头卡 / 字幕 / 配音 / 转场 / 调色
                    </span>
                  </p>
                  </div>

                  <div className="grid content-center gap-2.5">
                    {/* v2.8 P1：分组标签区隔「产品能力」与上方 01~05 流程步骤（VLM：样式雷同易误读为第 06~09 步） */}
                    <p className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-muted-foreground/70">
                      产品能力 · 开机即得
                      <span className="h-px flex-1 bg-border/60" />
                    </p>
                    {VALUE_PROPS.map((v) => (
                      <div
                        key={v.title}
                        className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3.5"
                      >
                        {/* v2.8 VLM 复审：accent 卡降权——取消卡级 amber 描边/浅底/阴影
                            （三重叠加被指压过五阶段导览），层级改由实底图标位 + 标题色承担 */}
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                            v.accent
                              ? "border-amber-400/40 bg-amber-500 text-amber-950"
                              : "border-border/60 bg-secondary/50 text-muted-foreground"
                          }`}
                        >
                          <v.icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className={`text-xs font-semibold ${v.accent ? "text-amber-300" : ""}`}>
                            {v.title}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            {v.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* —— 数据规模尾条（v2.8：删尾部版本号——与顶栏徽标重复被 VLM 判冗余） —— */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-400/80" />
                    {GENRES.length} 套题材预设
                  </span>
                  <span className="flex items-center gap-1">
                    <Film className="h-3 w-3 text-amber-400/80" />
                    {Object.keys(CAMERA_MOVEMENTS).length} 式运镜库
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-amber-400/80" />
                    {Object.keys(CREW_ROLES).length} 个剧组岗位
                  </span>
                </div>
              </section>
            )}

            {!generating && session && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {/* v2.6：五阶段导轨常驻页签上方——生产进度即导航（详见 pipeline-rail.tsx） */}
                <PipelineRail
                  run={activeRun}
                  session={session}
                  onNavigate={setTab}
                />
                <Tabs
                  value={tab}
                  onValueChange={(v) => setTab(v as WorkbenchTab)}
                  className="space-y-4"
                >
                  <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-secondary/40 p-1">
                    {/* §7.13 v2.5.2：激活页签用深底反白片（VS Code 式）强化选中态，
                        绿点加 tooltip 说明成片就绪语义（VLM 审计 P1/P2） */}
                    <TabsTrigger
                      value="cut"
                      className="relative gap-1.5 px-3 text-xs font-medium data-[state=active]:font-bold after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-amber-400 after:opacity-0 after:transition-opacity data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:after:opacity-100"
                    >
                      <Film className="h-3.5 w-3.5" />
                      成片
                      {session.finalVideoUrl && (
                        <span
                          title="成片已就绪，可下载"
                          className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                        />
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="script"
                      className="relative gap-1.5 px-3 text-xs font-medium data-[state=active]:font-bold after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-amber-400 after:opacity-0 after:transition-opacity data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:after:opacity-100"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      分镜剧本
                    </TabsTrigger>
                    <TabsTrigger
                      value="assets"
                      className="relative gap-1.5 px-3 text-xs font-medium data-[state=active]:font-bold after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-amber-400 after:opacity-0 after:transition-opacity data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:after:opacity-100"
                    >
                      <Users className="h-3.5 w-3.5" />
                      资产定妆
                    </TabsTrigger>
                    <TabsTrigger
                      value="rhythm"
                      className="relative gap-1.5 px-3 text-xs font-medium data-[state=active]:font-bold after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-amber-400 after:opacity-0 after:transition-opacity data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:after:opacity-100"
                    >
                      <Gauge className="h-3.5 w-3.5" />
                      节奏轨道
                    </TabsTrigger>
                    <TabsTrigger
                      value="pipeline"
                      className="relative gap-1.5 px-3 text-xs font-medium data-[state=active]:font-bold after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-amber-400 after:opacity-0 after:transition-opacity data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:after:opacity-100"
                    >
                      <Workflow className="h-3.5 w-3.5" />
                      剧组进程
                      {pipelineRunning && (
                        <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent
                    value="cut"
                    className="mt-0 space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200"
                  >
                    <FinalCutPanel />
                  </TabsContent>

                  <TabsContent
                    value="script"
                    className="mt-0 space-y-5 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200"
                  >
                    {session.beats.map((beat, idx) => (
                      <ActCard key={beat.index} beat={beat} delay={idx * 0.08} />
                    ))}
                    <TimelinePanel />
                  </TabsContent>

                  <TabsContent
                    value="assets"
                    className="mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200"
                  >
                    <AssetLibraryPanel />
                  </TabsContent>

                  <TabsContent
                    value="rhythm"
                    className="mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200"
                  >
                    <RhythmPanel onJumpToCut={() => setTab("cut")} />
                  </TabsContent>

                  <TabsContent
                    value="pipeline"
                    className="mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200"
                  >
                    <CrewPipelinePanel />
                  </TabsContent>
                </Tabs>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      <ProjectLibraryDrawer />

      {/* §7.13 v2.5.2：重新开机二次确认——破坏性重写不可一键误触 */}
      <AlertDialog open={rerunConfirmOpen} onOpenChange={setRerunConfirmOpen}>
        <AlertDialogContent className="border-t-2 border-t-red-500/70">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              确认按新配置重新开机？
            </AlertDialogTitle>
            <AlertDialogDescription>
              将以当前题材与梗概重写剧本、分镜与锚点，现有资产定妆与引用关系会被重建；
              已合成成片与任务历史保留。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>再想想</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setRerunConfirmOpen(false);
                void handleStartPipeline();
              }}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              <Clapperboard className="h-4 w-4" />
              重写并开机
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 页脚（移动端展示；桌面端锁定视口布局下隐藏，见 §7.10） */}
      <footer className="mt-auto border-t border-border/60 bg-background/60 lg:hidden">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1.5 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>制作团队：剧集智能创编工坊 (DRAMA STUDIO) · 本页为该工具的复刻实现，仅用于剧本创意推演</p>
          <p>场次结构：首场黄金钩子 → 中段升级/反转/顶点 → 末场卡点留钩</p>
        </div>
      </footer>
    </div>
  );
}
