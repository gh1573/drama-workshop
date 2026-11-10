"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Layers, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { PROJECT_STATUS, type ProjectDetail, type ProjectSummary } from "@/lib/drama";
import { api, useWorkbench } from "@/store/workbench";

/** 项目库抽屉：系列分组的多项目列表 / 载入 / 重命名 / 删除 */
export function ProjectLibraryDrawer() {
  const { toast } = useToast();
  const open = useWorkbench((s) => s.libraryOpen);
  const setOpen = useWorkbench((s) => s.setLibraryOpen);
  const library = useWorkbench((s) => s.library);
  const libraryLoading = useWorkbench((s) => s.libraryLoading);
  const currentDbId = useWorkbench((s) => s.session?.dbId ?? null);
  const fetchLibrary = useWorkbench((s) => s.fetchLibrary);
  const loadProject = useWorkbench((s) => s.loadProject);
  const removeProject = useWorkbench((s) => s.removeProject);
  const renameProject = useWorkbench((s) => s.renameProject);

  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** v2.3：按系列分组（系列内按集号排序，无系列项目独立展示） */
  const groups = useMemo(() => {
    const bySeries = new Map<
      string,
      { title: string; episodes: ProjectSummary[] }
    >();
    const standalone: ProjectSummary[] = [];
    for (const p of library) {
      if (p.seriesId && p.seriesTitle) {
        const g =
          bySeries.get(p.seriesId) ?? { title: p.seriesTitle, episodes: [] };
        g.episodes.push(p);
        bySeries.set(p.seriesId, g);
      } else {
        standalone.push(p);
      }
    }
    for (const g of bySeries.values()) {
      g.episodes.sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0));
    }
    return { series: [...bySeries.values()], standalone };
  }, [library]);

  useEffect(() => {
    if (open) void fetchLibrary();
  }, [open, fetchLibrary]);

  async function handleLoad(id: string) {
    setBusyId(id);
    try {
      const detail = await api<ProjectDetail>(`/api/projects/${id}`);
      loadProject(detail);
      toast({ title: "项目已载入", description: detail.title });
    } catch (e) {
      toast({
        title: "载入失败",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(id: string, title: string) {
    const ok = await removeProject(id);
    toast({
      title: ok ? "项目已删除" : "删除失败",
      description: ok ? title : undefined,
      variant: ok ? "default" : "destructive",
    });
  }

  async function handleRename() {
    if (!renaming) return;
    const ok = await renameProject(renaming.id, renaming.title.trim());
    toast({
      title: ok ? "已重命名" : "重命名失败",
      variant: ok ? "default" : "destructive",
    });
    if (ok) setRenaming(null);
  }

  function renderCard(p: ProjectSummary) {
    const active = p.id === currentDbId;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleLoad(p.id)}
        onKeyDown={(e) => e.key === "Enter" && handleLoad(p.id)}
        className={`cursor-pointer rounded-xl border p-3 transition-colors ${
          active
            ? "border-emerald-500/50 bg-emerald-500/5"
            : "border-border/70 bg-secondary/30 hover:border-muted-foreground/40"
        } ${busyId === p.id ? "opacity-60" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {p.episodeNo != null && (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
            >
              第 {p.episodeNo} 集
            </Badge>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {p.title}
          </span>
          {active && (
            <Badge
              variant="outline"
              className="border-emerald-500/50 text-[10px] text-emerald-400"
            >
              当前
            </Badge>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            {p.genreName}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {PROJECT_STATUS[p.status]}
          </Badge>
          <span>
            {p.beatCount} 幕 · {p.clipCount} 片段
          </span>
          <span className="ml-auto">
            {new Date(p.updatedAt).toLocaleString("zh-CN", {
              hour12: false,
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 border-border/70 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setRenaming({ id: p.id, title: p.title });
            }}
          >
            <Pencil className="h-3 w-3" />
            重命名
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 border-rose-500/40 px-2 text-xs text-rose-400 hover:bg-rose-500/10"
            onClick={(e) => {
              e.stopPropagation();
              void handleRemove(p.id, p.title);
            }}
          >
            <Trash2 className="h-3 w-3" />
            删除
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto border-border/60 bg-card sm:max-w-md">
        <SheetHeader className="space-y-1 pb-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4 text-amber-400" />
            项目库
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            已保存 {library.length} 个项目 · 点击卡片载入工作台
          </p>
        </SheetHeader>

        {libraryLoading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          </div>
        ) : library.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 p-8 text-center text-xs text-muted-foreground">
            还没有保存的项目
            <br />
            生成完分镜后点击「保存到项目库」即可归档
          </div>
        ) : (
          <ul className="space-y-4 pb-4">
            {groups.series.map((g) => (
              <li key={g.title + g.episodes[0]?.seriesId} className="space-y-2">
                <div className="flex items-center gap-1.5 px-1">
                  <Layers className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-200/90">
                    {g.title}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 text-[10px] text-amber-300"
                  >
                    连载 {g.episodes.length} 集
                  </Badge>
                </div>
                <ul className="space-y-2.5 border-l border-amber-500/20 pl-3">
                  {g.episodes.map((p) => renderCard(p))}
                </ul>
              </li>
            ))}
            {groups.standalone.map((p) => (
              <li key={p.id}>{renderCard(p)}</li>
            ))}
          </ul>
        )}

        <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>重命名项目</DialogTitle>
            </DialogHeader>
            <Input
              value={renaming?.title ?? ""}
              onChange={(e) =>
                setRenaming((r) => (r ? { ...r, title: e.target.value } : r))
              }
              maxLength={80}
              className="border-border/70 bg-secondary/30 text-sm"
            />
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRenaming(null)}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleRename}
                className="bg-gradient-to-r from-red-600 to-amber-500 text-white hover:opacity-90"
              >
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
