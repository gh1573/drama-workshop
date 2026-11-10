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
import { CLIP_STATUS, type ClipData } from "@/lib/drama";
import { useWorkbench } from "@/store/workbench";

/**
 * 镜头轨素材排布 —— 时间轨管理面板
 * 状态流转：待生成 → (未来接入视频模型自动流转) → 已生成 / 失败
 * 当前支持手动「回填成片」：粘贴外部工具产出的视频地址并标记完成
 */
export function TimelinePanel() {
  const { toast } = useToast();
  const clips = useWorkbench((s) => s.session?.clips ?? []);
  const moveClip = useWorkbench((s) => s.moveClip);
  const removeClip = useWorkbench((s) => s.removeClip);
  const patchClip = useWorkbench((s) => s.patchClip);
  const [target, setTarget] = useState<ClipData | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = [...clips].sort((a, b) => a.order - b.order);

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

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold tracking-wide">镜头轨素材排布</h3>
        <Badge variant="outline" className="ml-auto text-xs">
          {sorted.length} 个片段
        </Badge>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
          分镜卡右下角的「加入镜头轨」按钮可将对应一幕追加到时间轨；
          保存项目后即可管理顺序、状态与成片地址
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((clip, i) => {
            const st = CLIP_STATUS[clip.status];
            return (
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
                <Badge variant="outline" className={`text-[10px] ${st.cls}`}>
                  {st.label}
                </Badge>
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
                    disabled={i === sorted.length - 1}
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
              </li>
            );
          })}
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
