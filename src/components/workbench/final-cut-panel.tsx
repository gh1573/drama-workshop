"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Download,
  Film,
  Info,
  Loader2,
  Music,
  Package,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Video,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useWorkbench } from "@/store/workbench";
import { GRADE_PRESETS, TRANSITION_MODES } from "@/config/templates";

/**
 * 成片面板（v2.4 §7.9 / v2.4.3 §7.4 / v2.4.4 BGM / v2.5 §7.11 后期风格）——「一键成片」的结果出口。
 * 三态：待渲染（一键渲染全片）→ 渲染中（进度 + 自动合成）→ 成片（播放器 + 下载/重合成）。
 * 全部镜头就绪且尚未合成时自动触发合成（失败需手动重试，避免死循环）。
 * 占位模式（noop 视频）下透出通道状态与贴片指引，创作流不阻塞。
 * 后期风格行：转场策略 + 调色预设（L4 落库，重合成后生效）；BGM 管理行：上传/回显/清除。
 */
export function FinalCutPanel() {
  const { toast } = useToast();
  const clips = useWorkbench((s) => s.session?.clips ?? []);
  const dbId = useWorkbench((s) => s.session?.dbId ?? null);
  const finalVideoUrl = useWorkbench((s) => s.session?.finalVideoUrl ?? null);
  const tasks = useWorkbench((s) => s.tasks);
  const composing = useWorkbench((s) => s.composing);
  const renderingAll = useWorkbench((s) => s.renderingAll);
  const renderAll = useWorkbench((s) => s.renderAll);
  const composeEpisode = useWorkbench((s) => s.composeEpisode);
  // —— v2.9 连载 → v2.9.5 弹窗提升会话层：开合走 store，弹窗本体在页面层挂载 ——
  const creatingEpisode = useWorkbench((s) => s.creatingEpisode);
  const setNextEpOpen = useWorkbench((s) => s.setNextEpOpen);

  const [composeError, setComposeError] = useState<string | null>(null);
  /* v2.9.7：视频通道是否真机改由 store 统一探明（一次探明全页面共享，
     避免各面板各自 fetch；null = 未探明，按真机口径展示不误导） */
  const realVideo = useWorkbench((s) => s.videoChannelReal);
  /** BGM 状态（null = 未设置；上传后需重新合成才入片） */
  const [bgm, setBgm] = useState<{ name: string; sizeBytes: number } | null>(null);
  const [bgmUploading, setBgmUploading] = useState(false);
  const bgmInputRef = useRef<HTMLInputElement>(null);
  // —— v2.5 后期风格：转场策略 + 调色预设（L4 落库，重合成后生效；"follow" 哨兵 = 跟随题材） ——
  const genreName = useWorkbench((s) => s.session?.genre.name ?? "");
  const sessionTransition = useWorkbench((s) => s.session?.transitionMode ?? "auto");
  const sessionGrade = useWorkbench((s) => s.session?.gradePreset ?? "");
  const [transitionMode, setTransitionMode] = useState(sessionTransition);
  const [gradeKey, setGradeKey] = useState(sessionGrade || "follow");
  const [styleSaving, setStyleSaving] = useState(false);
  // 会话切换（载入/重命名项目）时同步本地选择
  useEffect(() => {
    setTransitionMode(sessionTransition);
    setGradeKey(sessionGrade || "follow");
  }, [sessionTransition, sessionGrade, dbId]);
  const composingRef = useRef(false);
  // ref 同步放 effect：避免渲染期写 ref（react-hooks/refs），提交后更新不误自动合成 guard
  useEffect(() => {
    composingRef.current = composing;
  }, [composing]);

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

  // 通道模式探明与 BGM 回显均上收到页面挂载/store（v2.9.7），本面板不再各自请求

  // BGM 状态回显（面板加载时还原已上传素材）
  useEffect(() => {
    if (!dbId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${dbId}/bgm`);
        const json = await res.json();
        if (json?.ok && json.data?.exists) {
          setBgm({ name: json.data.name, sizeBytes: json.data.sizeBytes });
        }
      } catch {
        /* 回显失败不影响主流程 */
      }
    })();
  }, [dbId]);

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
          toast({ title: "成片已就绪", description: "可在下方播放器直接看片" });
        }
      })();
    }
  }, [allReady, finalVideoUrl, composeError, composeEpisode, toast]);

  async function handleRenderAll() {
    setComposeError(null);
    const okDone = await renderAll();
    if (okDone) {
      toast({
        title: "全片渲染已提交",
        description: realVideo === false
          ? "占位模式：视频任务秒级落定并给出贴片指引（零配额），配音任务正常出片"
          : "视频 + 配音任务已进入渲染队列，进度将实时更新",
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
      toast({ title: "合成失败", description: err, variant: "destructive" });
    } else {
      toast({ title: "成片已就绪", description: "可在下方播放器直接看片" });
    }
  }

  async function handleBgmFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file || !dbId) return;
    setBgmUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${dbId}/bgm`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json?.ok) {
        setBgm({ name: json.data.name, sizeBytes: json.data.sizeBytes });
        toast({
          title: "BGM 已上传",
          description: "重新合成后生效（循环铺底 · 对白自动闪避）",
        });
      } else {
        toast({
          title: "BGM 上传失败",
          description: json?.error ?? "请重试",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "BGM 上传失败", description: "网络异常，请重试", variant: "destructive" });
    } finally {
      setBgmUploading(false);
    }
  }

  async function handleBgmDelete() {
    if (!dbId) return;
    setBgmUploading(true);
    try {
      const res = await fetch(`/api/projects/${dbId}/bgm`, { method: "DELETE" });
      const json = await res.json();
      if (json?.ok) {
        setBgm(null);
        toast({ title: "BGM 已清除", description: "重新合成后回落为纯配音成片" });
      } else {
        toast({ title: "清除失败", description: json?.error ?? "请重试", variant: "destructive" });
      }
    } catch {
      toast({ title: "清除失败", description: "网络异常，请重试", variant: "destructive" });
    } finally {
      setBgmUploading(false);
    }
  }

  /** 后期风格持久化（PATCH 项目，compose 时服务端读取）；value 由调用方预判更新 */
  async function patchPostStyle(patch: {
    transitionMode?: string;
    gradePreset?: string | null;
  }): Promise<boolean> {
    if (!dbId) {
      toast({
        title: "尚未入库",
        description: "请先「保存到项目库」后再设置后期风格",
        variant: "destructive",
      });
      return false;
    }
    setStyleSaving(true);
    try {
      const res = await fetch(`/api/projects/${dbId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (json?.ok) return true;
      toast({ title: "设置失败", description: json?.error ?? "请重试", variant: "destructive" });
      return false;
    } catch {
      toast({ title: "设置失败", description: "网络异常，请重试", variant: "destructive" });
      return false;
    } finally {
      setStyleSaving(false);
    }
  }

  async function handleTransitionChange(value: string) {
    const prev = transitionMode;
    setTransitionMode(value); // 预判更新，失败回滚
    if (!(await patchPostStyle({ transitionMode: value }))) {
      setTransitionMode(prev);
      return;
    }
    toast({ title: "转场策略已更新", description: "重新合成后生效" });
  }

  async function handleGradeChange(value: string) {
    const prev = gradeKey;
    setGradeKey(value);
    // "follow" 哨兵 = 跟随题材（落库 null）；其余为 GRADE_PRESETS 键
    if (!(await patchPostStyle({ gradePreset: value === "follow" ? null : value }))) {
      setGradeKey(prev);
      return;
    }
    toast({
      title: "调色预设已更新",
      description:
        value === "follow" ? "跟随题材影调 · 重新合成后生效" : "重新合成后生效",
    });
  }

  /* v2.9.14（用户视角走查 P1）：零镜头（未开机）时此前整块返回 null——
     手动点「成片」页签会得到一片空白工作区，无指引的死胡同；
     对齐资产库空态模式：说明成因 + 指向下一步 */
  if (total === 0) {
    return (
      <section className="space-y-2 rounded-xl border border-dashed border-border/70 bg-card p-6 text-center">
        <Film className="mx-auto h-6 w-6 text-muted-foreground/60" />
        <p className="text-sm font-semibold">尚未开机 · 这里还没有可看成片</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          左侧「全组开机」启动剧组流水线，镜头将在「导演拆镜」阶段逐镜落位，
          全部出片后自动合成、直接在这里播放；先看剧本可切「分镜剧本」页签。
        </p>
      </section>
    );
  }

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
            /* v2.8 色彩纪律：「待合成」属中性待办，sky 色相出局走灰阶 */
            className="border-border/70 bg-secondary/40 text-[10px] text-muted-foreground"
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
        ) : null}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {readyCount}/{total} 镜就绪 · 约{" "}
          {Math.round(
            sorted.reduce((m, c) => m + (c.plannedMs ?? 0), 0) / 1000
          )}
          s
        </span>
      </div>
      {finalVideoUrl && !allReady && (
        /* v2.9.1 交付语义（全局走查 P1）：「已合成」与「N/N 镜就绪」并存时
            必须解释成片口径，否则用户必然追问「缺的那 1 镜去哪了」 */
        <p className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          本版成片由 {readyCount} 个就绪镜头合成，{pendingCount} 镜未就绪未计入；
          补拍完成后点「重新合成」即可入片，无需重拍已就绪镜头。
        </p>
      )}

      {/* —— 播放器 / 占位（镜头级进度网格让空态有生命感） —— */}
      <div className="flex justify-center">
        {finalVideoUrl ? (
          <video
            key={finalVideoUrl}
            src={finalVideoUrl}
            /* v2.9.2：封面帧走约定路径（合成时 25% 处抽取）；旧成片无 poster 时
               404 自动回退黑帧，行为不变 */
            poster={finalVideoUrl.replace(/\.mp4$/, "_poster.jpg")}
            controls
            playsInline
            className="max-h-[560px] w-auto max-w-full rounded-xl border border-white/10 bg-black shadow-2xl shadow-black/70 ring-1 ring-white/15"
          />
        ) : (
          <div className="flex aspect-[9/16] w-full max-w-[315px] flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-dashed border-border/70 bg-gradient-to-b from-red-600/5 via-transparent to-amber-500/10 p-6 text-center">
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

            {/* 镜头级状态网格：一镜一格，就绪亮绿，未出灰格 */}
            {!composing && !allReady && (
              <div className="w-full space-y-1.5">
                <div className="grid grid-cols-6 gap-1">
                  {sorted.map((c, i) => {
                    const ready = c.status === "ready" && c.mediaUrl;
                    return (
                      <span
                        key={c.id ?? i}
                        title={`镜 ${String(i + 1).padStart(2, "0")} · ${
                          ready ? "已出片" : "待出片"
                        }`}
                        className={`flex h-6 items-center justify-center rounded-[5px] border font-mono text-[9px] ${
                          ready
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                            : "border-border/60 bg-secondary/50 text-muted-foreground/60"
                        }`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    );
                  })}
                </div>
                {renderProgress > 0 && (
                  <div className="space-y-1">
                    <Progress value={renderProgress} className="h-1.5" />
                    <p className="font-mono text-[10px] text-muted-foreground">
                      渲染进度 {renderProgress}%（{readyCount}/{total}）
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* —— 成片动作区（v2.7.1 VLM P0 修复：终态主操作从页尾上移至紧随播放器，
          免滚动直达；后期风格/BGM 属高级配置让位其后） —— */}
      {finalVideoUrl && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border/60 pt-3">
          <a href={finalVideoUrl} download target="_blank" rel="noreferrer">
            {/* v2.6 VLM 复审：下载成片 = 全链路终点主操作，从 emerald 描边升级为
                品牌渐变实底（绿色仅限状态徽标，不承载操作） */}
            <Button className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 font-bold text-white shadow-lg shadow-red-600/25 hover:opacity-90">
              <Download className="h-4 w-4" />
              下载成片 MP4
            </Button>
          </a>
          {/* v2.9 制作包交付：成片只是交付物之一——工作室二次剪辑/投流需要
              镜头素材、定妆图、分镜表、字幕、配音的完整制作包 */}
          <a
            href={`/api/projects/${dbId}/package`}
            title="成片 + 镜头素材 + 定妆图 + 分镜表 + 字幕 + 配音 + 工程档案（ZIP）"
          >
            <Button
              variant="outline"
              className="border-border/70 font-semibold hover:bg-secondary/40"
            >
              <Package className="h-4 w-4" />
              下载制作包 ZIP
            </Button>
          </a>
          {/* v2.9 连载产品化：成片交付不是终点，续写下一集是连载生产线的主动线——
              独立项目自动升级为系列第 1 集，资产定妆克隆（跨集同一张脸）。
              v2.9.5：弹窗提升会话层（上集回顾 + AI 接钩子在共享组件内） */}
          <Button
            variant="outline"
            disabled={creatingEpisode}
            onClick={() => setNextEpOpen(true)}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
          >
            {creatingEpisode ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            续写下一集
          </Button>
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
          {/* v2.7.1：去掉绿勾图标（与页签绿点/「已合成」徽标构成三层状态重复，
              VLM P1）——本行为合成内容说明，回归纯文本 */}
          <p className="text-xs text-muted-foreground">
            片头卡 + 转场 + 调色 + 字幕烧录 + 配音混音{bgm ? " + BGM" : ""} 已合入成片
          </p>
          {/* v2.9.5 制作包清单常显（VLM 16 视图走查 4 视图复现「ZIP 里有什么不可见」）：
              hover title 之外给一行常显清单——工作室二次剪辑/投流按需取物 */}
          <p className="w-full text-center text-[11px] leading-relaxed text-muted-foreground">
            制作包含：镜头素材 · 定妆图 · 分镜表 · 字幕 · 配音 · 工程档案
          </p>
        </div>
      )}

      {/* —— 后期风格（v2.5 §7.11）：转场策略 + 调色预设，重合成后生效 ——
          v2.8 P1：降为次级面板观感（去 amber 图标/降对比），保「下载成片」为成片页唯一最高权重动作 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-secondary/20 px-3 py-2">
        <Wand2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">后期风格</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Select
            value={transitionMode}
            onValueChange={handleTransitionChange}
            disabled={styleSaving}
          >
            <SelectTrigger className="h-7 w-[230px] border-border/60 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSITION_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={gradeKey}
            onValueChange={handleGradeChange}
            disabled={styleSaving}
          >
            <SelectTrigger className="h-7 w-[200px] border-border/60 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="follow" className="text-xs">
                跟随题材影调{genreName ? `（${genreName}）` : ""}
              </SelectItem>
              {Object.entries(GRADE_PRESETS).map(([key, preset]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="w-full text-[10px] leading-relaxed text-muted-foreground/70">
          智能矩阵：片头卡溶解入戏 · 同场硬切保节奏 · 悬念场压黑收束（§7.11）；调色在字幕烧录前作用，白字不偏色
        </p>
      </div>

      {/* —— BGM 管理行（v2.4.4）：上传/回显/清除，合成时循环铺底 + 对白自动闪避（v2.8 P1 同步降为次级） —— */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-secondary/20 px-3 py-2">
        <Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">背景音乐</span>
        {bgm ? (
          <>
            <span className="min-w-0 max-w-[220px] truncate text-xs text-muted-foreground">
              {bgm.name}（{(bgm.sizeBytes / 1024 / 1024).toFixed(1)}MB）
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={bgmUploading}
                onClick={() => bgmInputRef.current?.click()}
                className="h-7 border-border/60 px-2.5 text-xs"
              >
                {/* v2.9.10：与「上传 BGM」同款在途转圈（一致性） */}
                {bgmUploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                更换
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bgmUploading}
                onClick={handleBgmDelete}
                className="h-7 border-border/60 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {bgmUploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                清除
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* v2.6 VLM 复审：「未设置」显式中性徽标，说明降为一句话（原警示语义混在灰文案里） */}
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              BGM 未设置
            </Badge>
            <span
              className="text-xs text-muted-foreground/80"
              title="上传后合成时循环铺底并自动闪避对白"
            >
              合成时循环铺底 · 自动闪避对白
            </span>
            <div className="ml-auto">
              {/* v2.6 VLM 复审：BGM 上传降为中性描边（amber 实底/tint 仅留给保存类主 CTA） */}
              <Button
                variant="outline"
                size="sm"
                disabled={bgmUploading}
                onClick={() => bgmInputRef.current?.click()}
                className="h-7 border-border/60 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                {bgmUploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                上传 BGM
              </Button>
            </div>
          </>
        )}
        <input
          ref={bgmInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/x-wav,audio/wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg"
          className="hidden"
          onChange={handleBgmFile}
        />
        <p className="w-full text-[10px] leading-relaxed text-muted-foreground/70">
          素材版权请自行确认；支持 mp3 / m4a / aac / wav / ogg，10MB 以内，同一项目保留一份
        </p>
      </div>

      {/* —— 操作区（渲染前/中的 CTA；成片后的下载动作已上移至播放器下方） —— */}
      <div className="flex flex-col items-center gap-2 border-t border-border/60 pt-3">
        {!finalVideoUrl && !allReady && activeVideoTasks === 0 && (
          <div className="flex flex-col items-center gap-1.5">
            <Button
              onClick={handleRenderAll}
              disabled={renderingAll}
              className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 font-bold text-white shadow-lg shadow-red-600/25 hover:opacity-90"
            >
              {/* v2.9.10：批量提交在途态——POST /render-all 慢网下数秒，
                  此前无禁用无转圈可连点重复建任务（审计 P0） */}
              {renderingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Video className="h-4 w-4" />
              )}
              {renderingAll ? "正在提交渲染任务…" : `一键渲染全片（${pendingCount} 镜 + 配音）`}
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
              渲染 → 合成 → 看片，一条流水线直达成片
            </p>
            {realVideo === false && (
              <p className="flex max-w-md items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2 text-left text-[11px] leading-relaxed text-amber-300/90">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                视频通道为占位模式（零配额消耗）：视频任务秒级落定并给出贴片指引，配音照常出片；
                真机出片需设置 VIDEO_PROVIDER=zai 后重启。
              </p>
            )}
          </div>
        )}
        {activeVideoTasks > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {/* v2.9.7 占位模式文案纠偏（E2E 走查：真机口径的「每镜 60~90s」
                在占位模式下是误导——占位任务秒级落定并给出贴片指引） */}
            {realVideo === false
              ? "视频任务快速落定中（占位模式 · 零配额），失败镜会给出贴片指引"
              : "视频通道渲染中（每镜约 60~90s，完成后自动合成）"}
          </p>
        )}
        {allReady && !finalVideoUrl && (
          <Button
            variant="outline"
            disabled={composing}
            onClick={handleCompose}
            className="border-amber-500/40 bg-amber-500/10 font-semibold text-amber-400 hover:bg-amber-500/20"
          >
            {composing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            重新合成成片
          </Button>
        )}
        {failedVideoTasks.length > 0 && !finalVideoUrl && (
          <p className="flex items-center gap-1.5 text-center text-xs text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {realVideo === false
              ? `${failedVideoTasks.length} 个镜头在占位模式下待处理：可在镜头轨贴片入库（直链自动下载 / 上传本地文件），或启用真机通道后重试`
              : `${failedVideoTasks.length} 个渲染任务失败，可在「剧组进程」页签重试后再次渲染`}
          </p>
        )}
        {composeError && (
          <p className="flex items-center gap-1.5 text-xs text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {composeError}
            {/* v2.9.10：显式调 handleCompose——此前仅清错误依赖自动合成 effect 重触发，
                若此刻 allReady 条件已不成立，点「重试」会毫无可见反应 */}
            <button
              onClick={handleCompose}
              disabled={composing}
              className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              {composing ? "合成中…" : "重试"}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
