"use client";

import { useState, useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  ExternalLink,
  Film,
  Loader2,
  Trash2,
  CheckCircle2,
  Layers,
  Upload,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { UserRound } from "lucide-react";
import { ASSET_ICONS } from "./asset-icons";
import {
  ASSET_KIND_META,
  CLIP_STATUS,
  NARRATIVE_META,
  type ClipData,
  type NarrativeFunction,
} from "@/lib/drama";
import { useWorkbench } from "@/store/workbench";
import { MovementMatrix } from "@/components/workbench/movement-matrix";

/**
 * 镜头轨素材排布 —— 工业级分镜表（Shot List）
 * 支持两种形态：
 * - AI 拆解后的分镜表：按场次分组，展示景别/运镜/画面/台词/时长，运镜可点选切换
 * - 手动片段：简单列表（状态流转 + 回填成片）
 */

function fmtSec(ms: number | null): string {
  if (ms == null) return "—";
  return `${Math.round(ms / 100) / 10}s`;
}

/* v2.9.12 用户视角走查：服务器返回非 JSON（代理错误页等）时，
 * res.json() 抛 SyntaxError 会把英文技术报错泄漏进 toast——守卫解析统一人话。 */
async function parseEnvelope(res: Response): Promise<{
  ok: boolean;
  error?: string;
  data?: { sizeBytes?: number; durationAligned?: boolean; mediaDurationMs?: number | null };
}> {
  try {
    return await res.json();
  } catch {
    throw new Error(`剧组服务器返回了无法识别的响应 (${res.status})——请稍后重试`);
  }
}

export function TimelinePanel() {
  const { toast } = useToast();
  const clips = useWorkbench((s) => s.session?.clips ?? []);
  const beats = useWorkbench((s) => s.session?.beats ?? []);
  const shotRefs = useWorkbench((s) => s.session?.shotRefs ?? []);
  const staleIds = useWorkbench((s) => s.session?.anchorStaleClipIds ?? []);
  const moveClip = useWorkbench((s) => s.moveClip);
  const removeClip = useWorkbench((s) => s.removeClip);
  const patchClip = useWorkbench((s) => s.patchClip);
  const tasks = useWorkbench((s) => s.tasks);
  const createTask = useWorkbench((s) => s.createTask);
  /* v2.9.7：通道模式共享 store 探明结果（占位模式下单镜渲染的 tooltip 与
     提交回执换成贴片指引口径，不再预告真机 60~90s） */
  const realVideo = useWorkbench((s) => s.videoChannelReal);
  const [target, setTarget] = useState<ClipData | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"download" | "upload" | null>(null);
  /* v2.9.10：行内小动作在途态（上移/下移/重置/删除——快操作但慢网下仍需
     禁用防连点，删除片段连点会重复 DELETE） */
  const [rowBusy, setRowBusy] = useState<Record<string, "move" | "reset" | "remove">>({});
  const markRowBusy = (clipId: string, action: "move" | "reset" | "remove") => {
    setRowBusy((r) => ({ ...r, [clipId]: action }));
  };
  const clearRowBusy = (clipId: string) => {
    setRowBusy((r) => {
      const next = { ...r };
      delete next[clipId];
      return next;
    });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshProject = useWorkbench((s) => s.refreshProject);
  // v2.4.1 §7.10：按场次折叠，默认全部收起（摘要行展示密度）
  const [openActs, setOpenActs] = useState<ReadonlySet<number>>(new Set());
  const [renderingClipId, setRenderingClipId] = useState<string | null>(null);

  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const hasBreakdown = sorted.some((c) => c.shotSize || c.cameraMovement);

  /** 该镜头是否有在途视频任务（用于行内按钮禁用与状态徽标） */
  const isClipRendering = (clipId: string) =>
    tasks.some(
      (t) =>
        t.kind === "video" &&
        t.payload?.clipId === clipId &&
        (t.status === "queued" || t.status === "running")
    );

  /** 行内单镜渲染（v2.4.1 §7.10）：服务端幂等去重，重复点击不会重复入队 */
  async function handleRenderClip(clip: ClipData) {
    if (renderingClipId) return;
    setRenderingClipId(clip.id);
    const err = await createTask("video", { clipId: clip.id });
    setRenderingClipId(null);
    if (err) {
      toast({ title: "渲染提交失败", description: err, variant: "destructive" });
    } else {
      toast({
        title: "已提交渲染",
        description:
          realVideo === false
            ? `「${clip.name}」占位模式将秒级给出贴片指引（零配额），配音照常出片`
            : `「${clip.name}」进入视频队列，完成后自动回填成片`,
      });
    }
  }

  function toggleAct(index: number) {
    setOpenActs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  /* v2.9.8 外部出片入库：外链下载落盘 / 本地文件上传，统一走 /api/clips/[id]/media，
     服务端自包含落盘 + 短素材时长对齐；「可留空仅标记完成」语义已除（合成必须
     消费真实媒体，留空会造成绿格子但合成必败的假完成态） */
  function closeAttachDialog() {
    setTarget(null);
    setUrl("");
    setBusy(null);
  }

  async function handleAttachUrl() {
    if (!target) return;
    const trimmed = url.trim();
    if (!/^https?:\/\//.test(trimmed)) {
      toast({
        title: "请粘贴 http(s) 视频直链",
        description: "例如网盘/图床的 mp4 直链；本地文件请用下方「上传本地文件」",
        variant: "destructive",
      });
      return;
    }
    setBusy("download");
    try {
      const res = await fetch(`/api/clips/${target.id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = await parseEnvelope(res);
      if (!json?.ok) throw new Error(json?.error ?? "入库失败");
      await refreshProject();
      reportAttached(json.data ?? {}, "下载");
      closeAttachDialog();
    } catch (e) {
      toast({
        title: "下载入库失败",
        description: e instanceof Error ? e.message : "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file || !target) return;
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/clips/${target.id}/media`, {
        method: "POST",
        body: fd,
      });
      const json = await parseEnvelope(res);
      if (!json?.ok) throw new Error(json?.error ?? "上传失败");
      await refreshProject();
      reportAttached(json.data ?? {}, "上传");
      closeAttachDialog();
    } catch (e) {
      toast({
        title: "上传入库失败",
        description: e instanceof Error ? e.message : "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  /** 入库成功播报：尺寸 + 时长对齐提示 + 全就绪时指路合成 */
  function reportAttached(
    data: { sizeBytes?: number; durationAligned?: boolean; mediaDurationMs?: number | null },
    verb: string
  ) {
    const clips = useWorkbench.getState().session?.clips ?? [];
    const allReady =
      clips.length > 0 && clips.every((c) => c.status === "ready" && c.mediaUrl);
    const hasFinal = !!useWorkbench.getState().session?.finalVideoUrl;
    toast({
      title: `「${target?.name ?? "镜头"}」成片已${verb}入库`,
      description: [
        data.sizeBytes ? `${(data.sizeBytes / 1024 / 1024).toFixed(1)}MB` : null,
        data.durationAligned && data.mediaDurationMs
          ? `时长已按素材对齐 ${(data.mediaDurationMs / 1000).toFixed(1)}s（短于计划，防字幕漂移）`
          : null,
        allReady
          ? hasFinal
            ? "全部镜头就绪——去「成片」页签重新合成即可入片"
            : "全部镜头就绪——打开「成片」页签即自动合成"
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  async function handleReset(clip: ClipData) {
    if (rowBusy[clip.id]) return;
    markRowBusy(clip.id, "reset");
    try {
      const ok = await patchClip(clip.id, { status: "pending", mediaUrl: null });
      toast({
        title: ok ? "已重置为待生成" : "操作失败",
        variant: ok ? "default" : "destructive",
      });
    } finally {
      clearRowBusy(clip.id);
    }
  }

  async function handleMove(clip: ClipData, dir: -1 | 1) {
    if (rowBusy[clip.id]) return;
    markRowBusy(clip.id, "move");
    try {
      const ok = await moveClip(clip.id, dir);
      if (!ok) toast({ title: "移动失败", variant: "destructive" });
    } finally {
      clearRowBusy(clip.id);
    }
  }

  async function handleRemove(clip: ClipData) {
    if (rowBusy[clip.id]) return;
    markRowBusy(clip.id, "remove");
    try {
      const ok = await removeClip(clip.id);
      toast({
        title: ok ? "片段已移出镜头轨" : "删除失败",
        variant: ok ? "default" : "destructive",
      });
    } finally {
      clearRowBusy(clip.id);
    }
  }

  /** 行内操作按钮组（v2.4.1：新增单镜渲染入口；v2.9.10 行内动作在途态） */
  const Actions = ({ clip, i, total }: { clip: ClipData; i: number; total: number }) => {
    const rendering = isClipRendering(clip.id);
    const rowAct = rowBusy[clip.id];
    return (
    <div className="flex items-center gap-0.5">
      {clip.status !== "ready" && clip.finalPrompt && (
        <button
          aria-label="渲染此镜"
          title={
            rendering
              ? "渲染中…"
              : realVideo === false
                ? "渲染此镜（占位模式：秒级给出贴片指引，零配额）"
                : "渲染此镜（视频通道，约 60~90s）"
          }
          disabled={rendering || renderingClipId !== null}
          onClick={() => void handleRenderClip(clip)}
          className="rounded-md p-1.5 text-amber-400 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {rendering ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Video className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      <button
        aria-label="上移"
        disabled={i === 0 || Boolean(rowAct)}
        onClick={() => handleMove(clip, -1)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-30"
      >
        {rowAct === "move" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowUp className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        aria-label="下移"
        disabled={i === total - 1 || Boolean(rowAct)}
        onClick={() => handleMove(clip, 1)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-30"
      >
        {rowAct === "move" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )}
      </button>
      {clip.status === "ready" ? (
        <button
          aria-label="重置为待生成"
          disabled={Boolean(rowAct)}
          onClick={() => handleReset(clip)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-30"
        >
          {rowAct === "reset" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Film className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <button
          aria-label="回填成片"
          onClick={() => {
            setTarget(clip);
            setUrl(clip.mediaUrl ?? "");
          }}
          className="rounded-md p-1.5 text-emerald-400 hover:bg-emerald-500/10"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        aria-label="删除片段"
        disabled={Boolean(rowAct)}
        onClick={() => handleRemove(clip)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-30"
      >
        {rowAct === "remove" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
    );
  };

  const StatusBadge = ({ clip }: { clip: ClipData }) => {
    const st = CLIP_STATUS[clip.status];
    const rendering = isClipRendering(clip.id);
    return (
      <>
        {rendering && (
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-400"
          >
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            渲染中
          </Badge>
        )}
        <Badge variant="outline" className={`text-[10px] ${st.cls}`}>
          {st.label}
        </Badge>
      </>
    );
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold tracking-wide">
          {hasBreakdown ? "分镜表 · 镜头轨素材排布" : "镜头轨素材排布"}
        </h3>
        <Badge variant="outline" className="ml-auto text-xs">
          {sorted.length} 个片段
          {hasBreakdown && ` · ${new Set(sorted.map((c) => c.beatIndex)).size} 场分组`}
        </Badge>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
          点击分镜卡上的「AI 拆解分镜」可将一场拆为 3~5 个镜头组（对齐真实短剧
          10~20 分镜/集的工业密度）；或用「加入镜头轨」手动追加片段。
          保存项目后即可管理顺序、运镜、状态与成片地址。
        </p>
      ) : hasBreakdown ? (
        <div className="space-y-4">
          {[...beats]
            .sort((a, b) => a.index - b.index)
            .map((beat) => {
              const group = sorted.filter((c) => c.beatIndex === beat.index);
              if (group.length === 0) return null;
              const fn = beat.narrativeFunction as NarrativeFunction;
              const groupMs = group.reduce((m, c) => m + (c.plannedMs ?? 0), 0);
              const groupReady = group.filter((c) => c.status === "ready").length;
              const groupRendering = group.some((c) => isClipRendering(c.id));
              const expanded = openActs.has(beat.index);
              return (
                <div key={beat.index} className="overflow-hidden rounded-lg border border-border/60">
                  {/* 摘要行：默认折叠，点击展开镜头行（v2.4.1 §7.10 分镜表密度） */}
                  <button
                    onClick={() => toggleAct(beat.index)}
                    className="flex w-full flex-wrap items-center gap-2 bg-secondary/40 px-3 py-2.5 text-left transition-colors hover:bg-secondary/60"
                  >
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <p className="text-xs font-bold">
                      第 {String(beat.index).padStart(2, "0")} 场 ·{" "}
                      {beat.actTitle.split("：")[1] ?? beat.actTitle}
                    </p>
                    <Badge
                      variant="outline"
                      className="border-border/60 text-[10px] text-muted-foreground"
                    >
                      {NARRATIVE_META[fn].tag} · {group.length} 镜头 · 就绪 {groupReady}/{group.length} ·{" "}
                      {fmtSec(groupMs)}
                    </Badge>
                    {groupRendering && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-400"
                      >
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        渲染中
                      </Badge>
                    )}
                  </button>
                  {expanded && (
                  <div>
                    {group.map((clip, gi) => (
                      <div
                        key={clip.id}
                        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 ${
                          gi % 2 === 0 ? "bg-secondary/30" : "bg-secondary/10"
                        } ${gi > 0 ? "border-t border-border/40" : ""}`}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-red-600/70 to-amber-500/70 text-[11px] font-bold text-white">
                          {gi + 1}
                        </span>
                        {clip.shotSize && (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-border/60 text-[10px] text-muted-foreground"
                          >
                            {clip.shotSize}
                          </Badge>
                        )}
                        {clip.cameraMovement ? (
                          <MovementMatrix
                            compact
                            current={clip.cameraMovement}
                            fn={fn}
                            onSelect={async (mv) => {
                              const okDone = await patchClip(clip.id, {
                                cameraMovement: mv,
                              });
                              if (!okDone)
                                toast({
                                  title: "运镜更新失败",
                                  variant: "destructive",
                                });
                            }}
                          />
                        ) : null}
                        <div className="min-w-0 flex-1 basis-52">
                          <p className="truncate text-xs font-semibold">
                            {clip.name}
                          </p>
                          {clip.visualDesc && (
                            <p
                              className="truncate text-[11px] text-muted-foreground"
                              title={clip.visualDesc}
                            >
                              {clip.visualDesc}
                            </p>
                          )}
                        </div>
                        {clip.subtitle && (
                          <p className="max-w-40 truncate text-[11px] italic text-foreground/75">
                            「{clip.subtitle}」
                          </p>
                        )}
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {fmtSec(clip.plannedMs)}
                        </span>
                        <StatusBadge clip={clip} />
                        {staleIds.includes(clip.id) && clip.promptVersion !== "manual" && (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-400"
                          >
                            锚点过期
                          </Badge>
                        )}
                        {shotRefs
                          .filter((r) => r.clipId === clip.id)
                          .slice(0, 3)
                          .map((r) => {
                            const RefIcon =
                              ASSET_ICONS[ASSET_KIND_META[r.kind]?.icon ?? ""] ??
                              UserRound;
                            return (
                              <Badge
                                key={r.id}
                                variant="outline"
                                className="shrink-0 gap-1 border-border/60 text-[10px] text-muted-foreground"
                              >
                                <RefIcon className="h-3 w-3" />
                                {r.assetName}
                              </Badge>
                            );
                          })}
                        {clip.mediaUrl && (
                          <a
                            href={clip.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="查看成片"
                            className="rounded-md p-1 text-emerald-400 hover:bg-emerald-500/10"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <Actions clip={clip} i={sorted.indexOf(clip)} total={sorted.length} />
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              );
            })}
          {/* 未关联到任何场次的片段（手动添加且该场已被重写） */}
          {sorted
            .filter((c) => !beats.some((b) => b.index === c.beatIndex))
            .map((clip) => (
              <div
                key={clip.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5"
              >
                <span className="h-6 w-6 shrink-0 rounded-md bg-zinc-600/60 text-center text-[11px] font-bold leading-6 text-white">
                  ·
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{clip.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    未关联场次（分镜已重写，可删除或保留作补拍素材）
                  </p>
                </div>
                <StatusBadge clip={clip} />
                <Actions
                  clip={clip}
                  i={sorted.indexOf(clip)}
                  total={sorted.length}
                />
              </div>
            ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((clip, i) => (
            <li
              key={clip.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-red-600/70 to-amber-500/70 text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{clip.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  第 {String(clip.beatIndex).padStart(2, "0")} 场
                  {clip.subtitle ? ` · ${clip.subtitle}` : ""}
                </p>
              </div>
              <StatusBadge clip={clip} />
              {clip.mediaUrl && (
                <a
                  href={clip.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="查看成片"
                  className="rounded-md p-1 text-emerald-400 hover:bg-emerald-500/10"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <Actions clip={clip} i={i} total={sorted.length} />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!target} onOpenChange={(open) => !open && closeAttachDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>回填成片 · {target?.name}</DialogTitle>
            <DialogDescription>
              外部工具出片后在此入库（自动下载落盘，成片不受外链过期影响），
              或直接上传本地文件；入库即标记完成，合成只消费已入库素材。
            </DialogDescription>
          </DialogHeader>
          {/* —— 通道一：直链下载入库 —— */}
          <div className="flex items-center gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && void handleAttachUrl()}
              placeholder="https://…/clip.mp4（视频直链）"
              disabled={busy !== null}
              className="border-border/70 bg-secondary/30 text-sm"
            />
            <Button
              size="sm"
              disabled={busy !== null || !url.trim()}
              onClick={() => void handleAttachUrl()}
              /* v2.8 色彩纪律：成功语义用单色 emerald，去 teal 渐变（引入第二色相无必要） */
              className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {busy === "download" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  下载入库中…
                </>
              ) : (
                "下载入库"
              )}
            </Button>
          </div>
          {/* —— 通道二：本地文件上传 —— */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
              className="hidden"
              onChange={(e) => void handleAttachFile(e)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-border/70"
            >
              {busy === "upload" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  上传入库中…
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  上传本地文件（mp4 / mov / webm / mkv，≤80MB）
                </>
              )}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            合成会按画幅自动裁剪归一（横竖盘皆可入片）；素材短于计划时长时自动对齐，防字幕漂移。
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
