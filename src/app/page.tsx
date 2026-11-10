"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Clapperboard,
  Sparkles,
  Clock,
  Video,
  Quote,
  Copy,
  FileJson,
  FileText,
  Film,
  Music,
  Palette,
  Lightbulb,
  Loader2,
  Wand2,
  MonitorPlay,
  Timer,
  Check,
  Gauge,
  Zap,
  Wand,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  GENRES,
  VIDEO_MODELS,
  DURATIONS,
  RESOLUTIONS,
  THINKING_LEVELS,
} from "@/lib/genres";
import {
  CAMERA_MOVEMENTS,
  NARRATIVE_META,
  buildProjectJson,
  buildMarkdown,
  downloadFile,
  formatLocalTime,
  type GenrePreset,
  type ModelConfig,
  type DramaProjectData,
  type NarrativeFunction,
} from "@/lib/drama";

const LOADING_STEPS = [
  "解析题材调性与钩子策略",
  "推演黄金 3 秒冲突开场",
  "编排中段绝地反转",
  "设计 12 秒悬念卡点",
  "打磨台词金句与画面提示",
];

const FN_STYLE: Record<
  NarrativeFunction,
  { badgeCls: string; barCls: string; quoteCls: string }
> = {
  hook: {
    badgeCls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    barCls: "from-amber-500 to-orange-500",
    quoteCls: "border-amber-400/70 bg-amber-500/10",
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

function StepCard({
  step,
  title,
  icon,
  children,
}: {
  step: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {step}
        </span>
        <h2 className="text-sm font-bold tracking-wide">{title}</h2>
        <span className="ml-auto text-amber-400">{icon}</span>
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const { toast } = useToast();
  const [genreId, setGenreId] = useState<string>("shuangwen");
  const [synopsis, setSynopsis] = useState<string>("");
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    videoModel: "Omni 1.2 Flash",
    durationSeconds: 5,
    resolution: "720p",
    scriptThinkingLevel: "low",
    enablePromptEnhance: true,
  });
  const [project, setProject] = useState<DramaProjectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);

  const genre = GENRES.find((g) => g.id === genreId) ?? GENRES[0];

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(
      () => setLoadingStep((s) => (s + 1) % LOADING_STEPS.length),
      2600
    );
    return () => clearInterval(t);
  }, [loading]);

  function selectGenre(g: GenrePreset) {
    setGenreId(g.id);
    setProject(null);
  }

  function applyModelChange(patch: Partial<ModelConfig>) {
    setModelConfig((c) => ({ ...c, ...patch }));
  }

  function handleVideoModelChange(value: string) {
    if (value === "Omni 1.2 Pro") {
      applyModelChange({ videoModel: value, durationSeconds: 8, resolution: "1080p" });
    } else {
      applyModelChange({ videoModel: value, durationSeconds: 5, resolution: "720p" });
    }
  }

  async function handleGenerate() {
    if (loading) return;
    if (synopsis.trim().length < 10) {
      toast({
        title: "梗概太短",
        description: "请输入至少 10 个字的剧情梗概，或点击「填充示例梗概」",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setLoadingStep(0);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genreId, synopsis, modelConfig }),
      });
      const data = (await res.json()) as {
        storyBeats?: import("@/lib/drama").StoryBeat[];
        error?: string;
      };
      if (!res.ok || !data.storyBeats) {
        throw new Error(data.error || "生成失败，请稍后重试");
      }
      const built = buildProjectJson(genre, synopsis, modelConfig, data.storyBeats);
      setProject(built);
      toast({
        title: "分镜推演完成",
        description: `${genre.name} · 三幕结构已生成，支持导出工程文件`,
      });
      setTimeout(
        () => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        150
      );
    } catch (e) {
      toast({
        title: "生成失败",
        description: e instanceof Error ? e.message : "未知错误，请稍后重试",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function exportJson() {
    if (!project) return;
    const name = `drama_project_${genre.id}_${Date.now()}.json`;
    downloadFile(name, JSON.stringify(project, null, 2), "application/json");
    toast({ title: "JSON 工程已导出", description: name });
  }

  function exportMd() {
    if (!project) return;
    const name = `drama_script_manifest_${genre.id}_${Date.now()}.md`;
    downloadFile(name, buildMarkdown(project), "text/markdown;charset=utf-8");
    toast({ title: "Markdown 制作清单已导出", description: name });
  }

  function copyText(text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast({ title: "已复制到剪贴板" }))
      .catch(() => toast({ title: "复制失败", variant: "destructive" }));
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
          <Badge className="hidden border-0 bg-gradient-to-r from-red-600/85 to-amber-500/85 text-white sm:inline-flex">
            9:16 竖屏短剧工作台
          </Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* ===== 左列：创作配置 ===== */}
          <div className="space-y-6 lg:col-span-5">
            <StepCard
              step="第一步"
              title="选择题材"
              icon={<Lightbulb className="h-4 w-4" />}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                {GENRES.map((g) => {
                  const active = g.id === genreId;
                  return (
                    <button
                      key={g.id}
                      onClick={() => selectGenre(g)}
                      aria-pressed={active}
                      className={`group rounded-xl border p-3 text-left transition-all ${
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
                        <span className="text-sm font-bold leading-tight">
                          {g.short}
                        </span>
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

            <StepCard step="第二步" title="剧情梗概" icon={<Film className="h-4 w-4" />}>
              <Textarea
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value.slice(0, 500))}
                placeholder={`输入你的故事梗概（10~500 字）……\n例如：${genre.sampleSynopsis}`}
                className="min-h-32 resize-none border-border/70 bg-secondary/30 text-sm leading-relaxed"
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
                <span className="text-xs text-muted-foreground">
                  {synopsis.length}/500 字
                </span>
              </div>
            </StepCard>

            <StepCard
              step="第三步"
              title="模型配置"
              icon={<MonitorPlay className="h-4 w-4" />}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">AI 视频基模</Label>
                  <Select
                    value={modelConfig.videoModel}
                    onValueChange={handleVideoModelChange}
                  >
                    <SelectTrigger className="w-full border-border/70 bg-secondary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VIDEO_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">单镜时长</Label>
                  <Select
                    value={String(modelConfig.durationSeconds)}
                    onValueChange={(v) =>
                      applyModelChange({ durationSeconds: Number(v) })
                    }
                  >
                    <SelectTrigger className="w-full border-border/70 bg-secondary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} 秒
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">分辨率</Label>
                  <Select
                    value={modelConfig.resolution}
                    onValueChange={(v) => applyModelChange({ resolution: v })}
                  >
                    <SelectTrigger className="w-full border-border/70 bg-secondary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    剧本思考深度
                  </Label>
                  <Select
                    value={modelConfig.scriptThinkingLevel}
                    onValueChange={(v) =>
                      applyModelChange({
                        scriptThinkingLevel: v as ModelConfig["scriptThinkingLevel"],
                      })
                    }
                  >
                    <SelectTrigger className="w-full border-border/70 bg-secondary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {THINKING_LEVELS.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/30 p-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Wand2 className="h-3.5 w-3.5 text-fuchsia-400" />
                    提示词增强
                  </p>
                  <p className="text-xs text-muted-foreground">
                    画面提示自动追加英文电影级关键词
                  </p>
                </div>
                <Switch
                  checked={modelConfig.enablePromptEnhance}
                  onCheckedChange={(v) => applyModelChange({ enablePromptEnhance: v })}
                />
              </div>
            </StepCard>

            <div className="space-y-3">
              <Button
                size="lg"
                disabled={loading || synopsis.trim().length < 10}
                onClick={handleGenerate}
                className="h-14 w-full bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 text-base font-bold text-white shadow-xl shadow-red-600/25 hover:opacity-90"
              >
                {loading ? (
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

              {loading && (
                <div className="space-y-2 rounded-xl border bg-card p-4">
                  {LOADING_STEPS.map((s, i) => (
                    <div key={s} className="flex items-center gap-2 text-sm">
                      {i < loadingStep ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : i === loadingStep ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                      ) : (
                        <span className="mx-1 h-2 w-2 rounded-full bg-muted-foreground/40" />
                      )}
                      <span
                        className={
                          i <= loadingStep ? "text-foreground" : "text-muted-foreground"
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

          {/* ===== 右列：分镜产出 ===== */}
          <div ref={outputRef} className="scroll-mt-20 space-y-6 lg:col-span-7">
            {loading && (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
              </div>
            )}

            {!loading && !project && (
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
                  AI 将按 Hook → Clash → Cliffhanger 黄金三幕结构推演
                </p>
              </div>
            )}

            {!loading && project && (
              <>
                {/* 工程信息卡 */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 rounded-xl border bg-card p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`border-0 bg-gradient-to-r ${genre.gradient} text-white`}>
                      {genre.icon} {project.project.genre.name}
                    </Badge>
                    <Badge variant="outline">{project.project.genre.badge}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      导出时间 {formatLocalTime(new Date(project.project.exportedAt))}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    <span className="font-semibold text-amber-400">梗概：</span>
                    {project.project.synopsis}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    {[
                      ["画幅", project.project.aspectRatio],
                      ["视频基模", project.project.modelConfig.videoModel],
                      [
                        "单镜",
                        `${project.project.modelConfig.durationSeconds}s / ${project.project.modelConfig.resolution}`,
                      ],
                      [
                        "思考深度",
                        project.project.modelConfig.scriptThinkingLevel,
                      ],
                      [
                        "提示词增强",
                        project.project.modelConfig.enablePromptEnhance ? "开启" : "关闭",
                      ],
                      ["分镜幕数", `${project.statistics.totalBeats} 幕`],
                      ["镜头片段", `${project.statistics.totalClips} 个`],
                      ["产出状态", "待生成"],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1.5"
                      >
                        <p className="text-muted-foreground">{k}</p>
                        <p className="mt-0.5 font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <p className="flex gap-2">
                      <Music className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                      <span className="text-muted-foreground">
                        配乐：{project.project.genre.musicMood}
                      </span>
                    </p>
                    <p className="flex gap-2">
                      <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
                        {project.project.genre.tonePrompt}
                      </span>
                    </p>
                  </div>
                </motion.div>

                {/* 导出栏 */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    onClick={exportJson}
                    variant="default"
                    className="flex-1 border border-amber-500/40 bg-amber-500/10 font-semibold text-amber-400 hover:bg-amber-500/20"
                  >
                    <FileJson className="h-4 w-4" />
                    导出 JSON 工程
                  </Button>
                  <Button
                    onClick={exportMd}
                    variant="default"
                    className="flex-1 border border-rose-500/40 bg-rose-500/10 font-semibold text-rose-400 hover:bg-rose-500/20"
                  >
                    <FileText className="h-4 w-4" />
                    导出 Markdown 清单
                  </Button>
                </div>

                {/* 三幕分镜卡 */}
                {project.storyBeats.map((beat, idx) => {
                  const fn = NARRATIVE_META[beat.narrativeFunction];
                  const style = FN_STYLE[beat.narrativeFunction];
                  return (
                    <motion.article
                      key={beat.index}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.12 }}
                      className="overflow-hidden rounded-xl border bg-card"
                    >
                      <div className={`h-1 bg-gradient-to-r ${style.barCls}`} />
                      <div className="space-y-4 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-gradient-to-r from-red-500 to-amber-500 bg-clip-text text-sm font-black tracking-wider text-transparent">
                            【第 {String(beat.index).padStart(2, "0")} 幕】
                          </span>
                          <h3 className="text-base font-bold">{beat.actTitle}</h3>
                          <Badge
                            variant="outline"
                            className={`ml-auto ${style.badgeCls}`}
                          >
                            {fn.tag}
                          </Badge>
                        </div>

                        <p className="flex gap-2 text-xs text-muted-foreground">
                          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                          {beat.pacingNote}
                        </p>

                        <div>
                          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                            情节画面
                          </p>
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
                            onClick={() => copyText(beat.dialogueSubtitle)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-border/70 text-xs">
                            <Video className="mr-1 h-3 w-3" />
                            {CAMERA_MOVEMENTS[beat.cameraMovement] ??
                              beat.cameraMovement}
                          </Badge>
                          <Badge variant="outline" className="border-border/70 text-xs">
                            <Timer className="mr-1 h-3 w-3" />
                            镜头产出状态：⏳ 待生成
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
                })}

                {/* 重新生成提示 */}
                <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-muted-foreground">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
                  满意就导出，不满意改梗概再点一次「开始生成分镜」即可重新推演
                  <Gauge className="h-3.5 w-3.5 text-amber-400" />
                </p>
              </>
            )}
          </div>
        </div>
      </main>

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
