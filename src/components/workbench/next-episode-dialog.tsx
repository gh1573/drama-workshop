"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api, useWorkbench } from "@/store/workbench";

/**
 * 创作下一集 Dialog（v2.9 连载产品化 → v2.9.5 提升为会话层共享组件 →
 * v2.9.15 叙事校准：不是「续写文本」（网文作者视角），而是「连续剧的创作路径」
 * （剧组视角）——每一集都是一次完整开机，跨集沿用资产、承接剧情）。
 *
 * v2.9.5 连载生产线会话态表达（VLM 16 视图走查：8 视图复现「连载不可见」）：
 * - 状态提升：开合从成片面板本地态提升到 store，信息卡「连续剧」区块与
 *   成片交付区共用同一弹窗——创作下一集不再只在成片页签可达；
 * - 上集回顾条：卡点留钩场摘录（场名 + 画面 + 金句）——下一集「接得住」的
 *   上下文现场（VLM P1：创作时无法对照上集内容）；
 * - AI 接钩子：编剧室按上集剧本 + 题材战术手册起草本集走向（80~150 字），
 *   填入框内可改——AI 只降门槛不代笔（普通创作者不太会写剧情走向）。
 */
export function NextEpisodeDialog() {
  const { toast } = useToast();
  const open = useWorkbench((s) => s.nextEpOpen);
  const setOpen = useWorkbench((s) => s.setNextEpOpen);
  const session = useWorkbench((s) => s.session);
  const creatingEpisode = useWorkbench((s) => s.creatingEpisode);
  const createNextEpisode = useWorkbench((s) => s.createNextEpisode);

  const [synopsis, setSynopsis] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  const seriesTitle = session?.seriesTitle ?? null;
  const episodeNo = session?.episodeNo ?? null;
  const nextNo = (episodeNo ?? 0) + 1;

  // 卡点留钩场 = 下一集要承接的上集结尾（无 cliffhanger 场时回退最后一场）
  const beats = session?.beats ?? [];
  const hook =
    beats.find((b) => b.narrativeFunction === "cliffhanger") ??
    beats[beats.length - 1] ??
    null;

  // 打开时清空上次草稿（每一集都是新的一次创作，不复用旧输入）
  useEffect(() => {
    if (open) {
      setSynopsis("");
      setError(null);
    }
  }, [open]);

  async function handleDraft() {
    if (!session?.dbId || drafting) return;
    setDrafting(true);
    setError(null);
    try {
      const { synopsis: draft } = await api<{ synopsis: string }>(
        `/api/projects/${session.dbId}/next-episode-synopsis`,
        { method: "POST" }
      );
      setSynopsis(draft);
      toast({
        title: "编剧室已接上钩子",
        description: "AI 起草的本集走向已填入，可修改后创建",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 起草失败，请重试或手动填写");
    } finally {
      setDrafting(false);
    }
  }

  async function handleCreate() {
    if (synopsis.trim().length < 10) {
      setError("请输入至少 10 个字的剧情梗概（承接上一集的钩子）");
      return;
    }
    setError(null);
    const res = await createNextEpisode({ synopsis: synopsis.trim() });
    if (res.ok) {
      setOpen(false);
      toast({
        title: `第 ${res.episodeNo} 集已创建`,
        description: res.clonedAssets
          ? `已继承 ${res.clonedAssets} 项资产定妆，题材与参数沿用上一集，可直接开机`
          : "题材与参数已沿用上一集，可直接开机",
      });
    } else {
      setError(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            创作下一集
            {seriesTitle && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {seriesTitle}
                {episodeNo ? ` · 现有第 ${episodeNo} 集` : ""}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            题材与模型参数自动沿用，资产库默认克隆——同一角色跨集同一张脸；剧情从上集钩子接起。
            {seriesTitle
              ? `新集将作为本连续剧第 ${nextNo} 集，走同一条创作路径。`
              : "本项目将升级为连续剧第 1 集，新集为第 2 集。"}
          </p>
          {/* 上集回顾：卡点留钩现场——下一集接得住（VLM P1：创作时无法对照上集） */}
          {hook && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
              <p className="text-[10px] font-semibold tracking-wide text-amber-300/90">
                上集留钩 · 第 {hook.index} 场「{hook.actTitle}」
              </p>
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-foreground/80">
                {hook.description}
              </p>
              {hook.dialogueSubtitle && (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {hook.dialogueSubtitle}
                </p>
              )}
            </div>
          )}
          <Textarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder="承接上一集结尾的钩子，写清本集剧情走向（至少 10 字）…"
            className="min-h-[96px] border-border/60 text-sm"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <DialogFooter className="sm:justify-between">
          {/* AI 接钩子：降门槛不代笔——起草结果进框可改（连续剧创作路径主动线） */}
          <Button
            variant="ghost"
            disabled={drafting || creatingEpisode}
            onClick={handleDraft}
            className="h-9 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
          >
            {drafting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI 接钩子写本集走向
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-border/70"
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creatingEpisode || synopsis.trim().length < 10}
              className="bg-amber-600 font-semibold text-white hover:bg-amber-500"
            >
              {creatingEpisode ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              创建第 {nextNo} 集
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
