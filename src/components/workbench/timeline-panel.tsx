"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  ExternalLink,
  Film,
  Trash2,
  CheckCircle2,
  Layers,
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
import {
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
 * - AI 拆解后的分镜表：按幕分组，展示景别/运镜/画面/台词/时长，运镜可点选切换
 * - 手动片段：简单列表（状态流转 + 回填成片）
 */

function fmtSec(ms: number | null): string {
  if (ms == null) return "—";
  return `${Math.round(ms / 100) / 10}s`;
}

export function TimelinePanel() {
  const { toast } = useToast();
  const clips = useWorkbench((s) => s.session?.clips ?? []);
  const beats = useWorkbench((s) => s.session?.beats ?? []);
  const moveClip = useWorkbench((s) => s.moveClip);
  const removeClip = useWorkbench((s) => s.removeClip);
  const patchClip = useWorkbench((s) => s.patchClip);
  const [target, setTarget] = useState<ClipData | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const hasBreakdown = sorted.some((c) => c.shotSize || c.cameraMovement);

  async function handleConfirmReady() {
    if (!target) return;
    setBusy(true);
    const ok = await patchClip(target.id, {
      status: "ready",
      mediaUrl: url.trim() ? url.trim() : null,
    });
    setBusy(false);
    setTarget(null);
    setUrl("");
    toast({
      title: ok ? "镜头已标记完成" : "操作失败",
      variant: ok ? "default" : "destructive",
    });
  }

  async function handleReset(clip: ClipData) {
    const ok = await patchClip(clip.id, { status: "pending", mediaUrl: null });
    toast({
      title: ok ? "已重置为待生成" : "操作失败",
      variant: ok ? "default" : "destructive",
    });
  }

  async function handleMove(clip: ClipData, dir: -1 | 1) {
    const ok = await moveClip(clip.id, dir);
    if (!ok) toast({ title: "移动失败", variant: "destructive" });
  }

  async function handleRemove(clip: ClipData) {
    const ok = await removeClip(clip.id);
    toast({
      title: ok ? "片段已移出镜头轨" : "删除失败",
      variant: ok ? "default" : "destructive",
    });
  }

  /** 行内操作按钮组 */
  const Actions = ({ clip, i, total }: { clip: ClipData; i: number; total: number }) => (
    <div className="flex items-center gap-0.5">
      <button
        aria-label="上移"
        disabled={i === 0}
        onClick={() => handleMove(clip, -1)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-30"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="下移"
        disabled={i === total - 1}
        onClick={() => handleMove(clip, 1)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-30"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      {clip.status === "ready" ? (
        <button
          aria-label="重置为待生成"
          onClick={() => handleReset(clip)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
        >
          <Film className="h-3.5 w-3.5" />
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
        onClick={() => handleRemove(clip)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const StatusBadge = ({ clip }: { clip: ClipData }) => {
    const st = CLIP_STATUS[clip.status];
    return (
      <Badge variant="outline" className={`text-[10px] ${st.cls}`}>
        {st.label}
      </Badge>
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
          {hasBreakdown && ` · ${new Set(sorted.map((c) => c.beatIndex)).size} 幕分组`}
        </Badge>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
          点击分镜卡上的「AI 拆解分镜」可将一幕拆为 3~5 个镜头组（对齐真实短剧
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
              return (
                <div key={beat.index} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-sky-400" />
                    <p className="text-xs font-bold">
                      第 {String(beat.index).padStart(2, "0")} 幕 ·{" "}
                      {beat.actTitle.split("：")[1] ?? beat.actTitle}
                    </p>
                    <Badge
                      variant="outline"
                      className="border-border/60 text-[10px] text-muted-foreground"
                    >
                      {NARRATIVE_META[fn].tag} · {group.length} 镜头 ·{" "}
                      {fmtSec(groupMs)}
                    </Badge>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border/60">
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
                            className="shrink-0 border-sky-500/40 bg-sky-500/10 text-sky-400 text-[10px]"
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
                </div>
              );
            })}
          {/* 未关联到任何幕的片段（手动添加且幕已被重写） */}
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
                    未关联幕（分镜已重写，可删除或保留作补拍素材）
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
                  第 {String(clip.beatIndex).padStart(2, "0")} 幕
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

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>回填成片 · {target?.name}</DialogTitle>
            <DialogDescription>
              视频基模生成通道尚未接入时，可在外部工具成片后粘贴地址并标记完成；
              未来接入后将由生成任务自动流转状态。
            </DialogDescription>
          </DialogHeader>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/clip.mp4（可留空，仅标记完成）"
            className="border-border/70 bg-secondary/30 text-sm"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTarget(null)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={handleConfirmReady}
              className="bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:opacity-90"
            >
              标记为已生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
