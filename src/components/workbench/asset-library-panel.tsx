"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ASSET_KIND_META, type AssetDTO, type AssetKind } from "@/lib/drama";
import { useWorkbench } from "@/store/workbench";
import { UserRound } from "lucide-react";
import { ASSET_ICONS } from "./asset-icons";

/**
 * 资产库面板 —— 一致性锚定的可视化载体（角色/场景/道具）。
 * 资产由剧组流水线「选角定妆」阶段自动建立，也可在此编辑：
 * 锚点被镜头引用时，改动需显式解冻确认（服务端二次校验）。
 */

const KIND_ORDER: AssetKind[] = ["character", "scene", "prop"];

function AssetCard({
  asset,
  onEdit,
  onPortrait,
  portraitBusy,
}: {
  asset: AssetDTO;
  onEdit: (a: AssetDTO) => void;
  onPortrait: (a: AssetDTO) => void;
  portraitBusy: boolean;
}) {
  const meta = ASSET_KIND_META[asset.kind];
  const KindIcon = ASSET_ICONS[meta.icon] ?? UserRound;
  return (
    <div className="flex gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3">
      {asset.portraitUrl ? (
        <img
          src={asset.portraitUrl}
          alt={`${meta.label}定妆图：${asset.name}`}
          className="h-24 w-16 shrink-0 rounded-md border border-border/60 object-cover"
        />
      ) : (
        <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border/60 bg-background/40">
          <KindIcon className="h-7 w-7 text-muted-foreground/60" />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-bold">{asset.name}</p>
          <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>
            {meta.label}
          </Badge>
          {asset.source === "manual" ? (
            <span className="text-[10px] text-zinc-400">手工建档</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">剧组建档</span>
          )}
          {asset.refCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              · {asset.refCount} 镜引用
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-[11px] leading-relaxed text-foreground/85" title={asset.lockedAppearance}>
          <span className="font-semibold text-amber-400">定妆：</span>
          {asset.lockedAppearance}
        </p>
        <p className="line-clamp-2 font-mono text-[10px] leading-relaxed text-muted-foreground" title={asset.visualAnchor}>
          {/* v2.8 色彩纪律：锚点属技术元数据，走灰阶；定妆保留 amber（品牌强调位） */}
          <span className="font-sans font-semibold text-foreground/70">锚点：</span>
          {asset.visualAnchor}
        </p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-border/70 px-2.5 text-[11px]"
            onClick={() => onEdit(asset)}
          >
            <Pencil className="h-3 w-3" />
            编辑锚点
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={portraitBusy}
            className="h-7 border-border/70 px-2.5 text-[11px] text-foreground/80 hover:bg-secondary/50 hover:text-foreground"
            onClick={() => onPortrait(asset)}
          >
            {portraitBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Camera className="h-3 w-3" />
            )}
            生成定妆照
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AssetLibraryPanel() {
  const { toast } = useToast();
  const session = useWorkbench((s) => s.session);
  const tasks = useWorkbench((s) => s.tasks);
  const createTask = useWorkbench((s) => s.createTask);
  const updateAsset = useWorkbench((s) => s.updateAsset);
  const reanchor = useWorkbench((s) => s.reanchor);
  const [reanchoring, setReanchoring] = useState(false);

  const [editing, setEditing] = useState<AssetDTO | null>(null);
  const [draftLocked, setDraftLocked] = useState("");
  const [draftAnchor, setDraftAnchor] = useState("");
  const [confirmUnfreeze, setConfirmUnfreeze] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portraitBusyId, setPortraitBusyId] = useState<string | null>(null);

  const assets = session?.assets ?? [];
  const byKind = useMemo(() => {
    const map: Record<AssetKind, AssetDTO[]> = {
      character: [],
      scene: [],
      prop: [],
    };
    for (const a of assets) map[a.kind]?.push(a);
    return map;
  }, [assets]);

  if (!session?.dbId) return null;

  const staleCount = session.anchorStaleClipIds.length;

  async function handleReanchor() {
    setReanchoring(true);
    const ok = await reanchor();
    setReanchoring(false);
    toast({
      title: ok ? "重新锚定完成" : "重新锚定失败",
      description: ok
        ? "过期镜头已按最新资产锚点重新组装提示词，可继续渲染"
        : "请稍后重试",
      variant: ok ? "default" : "destructive",
    });
  }

  function openEdit(asset: AssetDTO) {
    setEditing(asset);
    setDraftLocked(asset.lockedAppearance);
    setDraftAnchor(asset.visualAnchor);
    setConfirmUnfreeze(false);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    const err = await updateAsset(
      editing.id,
      { lockedAppearance: draftLocked.trim(), visualAnchor: draftAnchor.trim() },
      confirmUnfreeze
    );
    setSaving(false);
    if (err) {
      toast({ title: "锚点更新失败", description: err, variant: "destructive" });
      return;
    }
    toast({
      title: "锚点已更新",
      description:
        "引用本资产的镜头将标记「锚点过期」，可在分镜表中查看并按需重拍",
    });
    setEditing(null);
  }

  async function handlePortrait(asset: AssetDTO) {
    setPortraitBusyId(asset.id);
    const err = await createTask("portrait", { assetId: asset.id });
    setPortraitBusyId(null);
    if (err) {
      toast({ title: "定妆照任务提交失败", description: err, variant: "destructive" });
      return;
    }
    toast({
      title: "定妆照任务已提交",
      description: `${asset.name} · 生成完成后自动回填资产卡，可在流水线面板任务中心查看进度`,
    });
  }

  const portraitActiveIds = new Set(
    tasks
      .filter((t) => t.kind === "portrait" && (t.status === "queued" || t.status === "running"))
      .map((t) => String(t.payload.assetId ?? ""))
  );

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold tracking-wide">资产库 · 一致性锚定</h3>
        <Badge variant="outline" className="text-xs">
          角色 {byKind.character.length} · 场景 {byKind.scene.length} · 道具 {byKind.prop.length}
        </Badge>
        <span className="ml-auto hidden items-center gap-1 text-[10px] text-muted-foreground sm:flex">
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
          锚点冻结机制：改动被引用的资产需解冻确认
        </span>
      </div>

      {staleCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="min-w-0 flex-1 text-xs text-amber-300">
            {staleCount} 个镜头的锚点已过期（资产外观改动），提示词需重新组装后才能恢复一致性
          </p>
          <Button
            size="sm"
            disabled={reanchoring}
            onClick={handleReanchor}
            className="h-7 border border-amber-500/40 bg-amber-500/10 px-2.5 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/20"
          >
            {reanchoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            重新锚定过期镜头
          </Button>
        </div>
      )}

      {assets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
          资产库将由剧组流水线的「选角定妆」阶段自动建立：角色、场景、道具逐一完成定妆锁定，
          后续所有镜头的提示词都会引用这里的锚点描述，保证跨镜头不换脸、不穿帮。
        </p>
      ) : (
        <Tabs defaultValue="character">
          <TabsList className="h-9 w-full justify-start overflow-x-auto bg-secondary/40">
            {KIND_ORDER.map((kind) => {
              const KindIcon = ASSET_ICONS[ASSET_KIND_META[kind].icon] ?? UserRound;
              return (
                <TabsTrigger key={kind} value={kind} className="gap-1.5 text-xs">
                  <KindIcon className="h-3.5 w-3.5" />
                  {ASSET_KIND_META[kind].label}
                  <span className="text-muted-foreground">{byKind[kind].length}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          {KIND_ORDER.map((kind) => (
            <TabsContent key={kind} value={kind} className="mt-3">
              {byKind[kind].length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
                  本项目暂无{ASSET_KIND_META[kind].label}资产
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {byKind[kind].map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onEdit={openEdit}
                      onPortrait={handlePortrait}
                      portraitBusy={portraitBusyId === asset.id}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* —— 锚点编辑对话框 —— */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑锚点 · {editing?.name}</DialogTitle>
            <DialogDescription>
              锁定外观是全镜头一致性的语义核心；英文锚点串会组装进每个引用镜头的提示词。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="locked-appearance" className="text-xs">
                锁定外观（中文定妆描述）
              </Label>
              <Textarea
                id="locked-appearance"
                value={draftLocked}
                onChange={(e) => setDraftLocked(e.target.value)}
                rows={3}
                className="border-border/70 bg-secondary/30 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visual-anchor" className="text-xs">
                视觉锚点（英文，跨镜头共用）
              </Label>
              <Textarea
                id="visual-anchor"
                value={draftAnchor}
                onChange={(e) => setDraftAnchor(e.target.value)}
                rows={3}
                className="border-border/70 bg-secondary/30 font-mono text-xs"
              />
            </div>
            {(editing?.refCount ?? 0) > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <Checkbox
                  id="confirm-unfreeze"
                  checked={confirmUnfreeze}
                  onCheckedChange={(v) => setConfirmUnfreeze(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="confirm-unfreeze" className="text-[11px] font-normal leading-relaxed text-amber-300">
                  该资产已被 {editing?.refCount} 个镜头锚定。解冻并修改锚点后，这些镜头将标记
                  「锚点过期」，需要重新组装提示词并重拍才能恢复一致。
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={
                saving ||
                draftLocked.trim().length < 5 ||
                draftAnchor.trim().length < 3 ||
                ((editing?.refCount ?? 0) > 0 && !confirmUnfreeze)
              }
              onClick={handleSaveEdit}
              /* §7.13 v2.6：保存类主操作统一 amber 实底（原 emerald→teal 渐变越出
                 品牌色域，且绿色语义应保留给状态徽标）——与「保存到项目库」同语言 */
              className="bg-amber-500 font-bold text-amber-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              保存锚点
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 后备提示：定妆照任务进行中的资产 */}
      {portraitActiveIds.size > 0 && (
        <p className="text-center text-[10px] text-muted-foreground">
          {portraitActiveIds.size} 张定妆照生成中，完成后自动回填资产卡
        </p>
      )}
    </section>
  );
}
