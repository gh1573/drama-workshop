"use client";

import { FileJson, FileText, Loader2, Save, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  PROJECT_STATUS,
  buildMarkdown,
  downloadFile,
  durationCrewLabel,
  resolutionCrewLabel,
  thinkingLevelCrewLabel,
  toExportData,
  videoModelCrewLabel,
} from "@/lib/drama";
import { sessionToDetail, useWorkbench } from "@/store/workbench";
import { GENRE_ICONS } from "./genre-icons";

/** 工程信息卡：项目概览 + 保存到项目库 + 双格式导出 */
export function ProjectInfoCard() {
  const { toast } = useToast();
  const session = useWorkbench((s) => s.session);
  const saving = useWorkbench((s) => s.saving);
  const saveProject = useWorkbench((s) => s.saveProject);

  if (!session) return null;
  const detail = sessionToDetail(session);
  const exportData = toExportData(detail);
  const GenreIcon = GENRE_ICONS[session.genre.icon] ?? Sparkles;

  function exportJson() {
    const name = `drama_project_${session!.genre.id}_${Date.now()}.json`;
    downloadFile(name, JSON.stringify(exportData, null, 2), "application/json");
    toast({ title: "JSON 工程已导出", description: name });
  }

  function exportMd() {
    const name = `drama_script_manifest_${session!.genre.id}_${Date.now()}.md`;
    downloadFile(name, buildMarkdown(exportData), "text/markdown;charset=utf-8");
    toast({ title: "Markdown 制作清单已导出", description: name });
  }

  async function handleSave() {
    if (!session) return;
    const ok = await saveProject();
    toast({
      title: ok
        ? session.dbId
          ? "项目已更新"
          : "已保存到项目库"
        : "保存失败",
      description: ok ? session.title : "请检查网络后重试",
      variant: ok ? "default" : "destructive",
    });
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        {/* v2.7.1 VLM 双轮复审：题材徽标从品牌渐变降为中性 chip——红色胶囊与
            错误语义冲突，且收紧后品牌渐变仅存 logo/主 CTA 两处，标题正文权重最高 */}
        <Badge className="gap-1.5 border-border/60 bg-secondary/70 text-foreground">
          <GenreIcon className="h-3 w-3" />
          {session.genre.name}
        </Badge>
        <Badge variant="outline">{session.genre.badge}</Badge>
        {/* v2.9 连载：系列归属徽标（连载第 N 集）——会话内持续可见连载身份 */}
        {session.seriesId && (
          <Badge
            variant="outline"
            className="border-amber-500/40 text-[10px] text-amber-300"
          >
            {session.seriesTitle || "连载"} · 第 {session.episodeNo ?? "?"} 集
          </Badge>
        )}
        {/* v2.6 VLM 复审：finalVideoUrl 存在时项目状态徽标让位（「制作中」与
            「成片已合成」同屏语义冲突）——成片徽标即最强事实 */}
        {!session.finalVideoUrl && (
          <Badge variant="outline" className="border-amber-500/40 text-amber-400">
            {PROJECT_STATUS[session.status]}
          </Badge>
        )}
        {/* §7.13 v2.5.2：成片产出为关键状态而非可调参数，从参数格上提至标题行
            （VLM 三轮复审反复指出状态与参数混排层级不清） */}
        <Badge
          variant="outline"
          className={
            session.finalVideoUrl
              ? "border-emerald-500/40 text-emerald-400"
              : "border-border/60 text-muted-foreground"
          }
        >
          {session.finalVideoUrl ? "成片已合成" : "成片未合成"}
        </Badge>
      </div>

      <p className="text-sm font-semibold">{session.title}</p>
      {/* v2.6 VLM 复审：行内标签从 amber 降为中性 section 标签（原标签权重高于正文形成倒挂） */}
      <p className="text-sm leading-relaxed text-foreground/90">
        <span className="font-semibold text-muted-foreground">梗概 · </span>
        {session.synopsis}
      </p>

      {/* §7.13 v2.5.2：参数格「标签上/值下」两行栅格。VLM 二轮复审：4 列太窄导致
          截断——改 2 列宽格，值完整可读（高频修复点）；
          v2.9.3 用户语言化：值一律走 drama.ts 剧组语言映射（单一来源），
          面向创作者不泄漏裸工程值（low/720p 等经映射后仍内含工程值小注）；
          状态值（开启/已合成）用语义徽标与可调参数区分 */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          { label: "画幅", value: detail.aspectRatio },
          { label: "拍摄机组", value: videoModelCrewLabel(session.modelConfig.videoModel) },
          {
            label: "单镜规格",
            value: `${durationCrewLabel(session.modelConfig.durationSeconds)} · ${resolutionCrewLabel(
              session.modelConfig.resolution
            )}`,
          },
          { label: "编剧深度", value: thinkingLevelCrewLabel(session.modelConfig.scriptThinkingLevel) },
          {
            label: "导演讲戏",
            value: session.modelConfig.enablePromptEnhance ? "开启" : "关闭",
            tone: session.modelConfig.enablePromptEnhance ? "on" : "off",
          },
          /* v2.6 VLM 复审：原 7 格 2+2+2+1 孤行断裂栅格——合并为一格收口成 2×3 */
          {
            label: "分镜规模",
            value: `${session.beats.length} 场 · ${session.clips.length} 镜`,
          },
        ].map((s) => (
          <div
            key={s.label}
            title={`${s.label}：${s.value}`}
            className="min-w-0 rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1.5"
          >
            <p className="truncate text-[10px] leading-4 text-muted-foreground">{s.label}</p>
            {s.tone ? (
              <span
                className={`mt-0.5 inline-block rounded px-1 py-px text-[10px] font-semibold leading-4 ${
                  s.tone === "on"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.value}
              </span>
            ) : (
              <p className="mt-0.5 truncate font-semibold leading-4 tabular-nums text-foreground">
                {s.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 色彩纪律 §7.13：保存 = 唯一 amber 实底主 CTA（渐变仅留给零态开机钮）；
          导出降为单行描边次级，文案不折行 */}
      <div className="space-y-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-10 w-full bg-amber-500 text-xs font-bold text-amber-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400"
        >
          {saving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Save className="h-4 w-4 shrink-0" />}
          {/* §7.13：语义明确化 —— 用户能预知点击后发生什么 */}
          {session.dbId ? "保存本次修改到项目库" : "保存到项目库"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={exportJson}
            variant="outline"
            title="导出完整工程 JSON（含场次/镜头/锚点）"
            className="h-9 border-border/70 px-2 text-xs font-semibold hover:bg-secondary/50"
          >
            <FileJson className="h-3.5 w-3.5 shrink-0" />
            导出 JSON
          </Button>
          <Button
            onClick={exportMd}
            variant="outline"
            title="导出 Markdown 制作清单"
            className="h-9 border-border/70 px-2 text-xs font-semibold hover:bg-secondary/50"
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            导出 MD 清单
          </Button>
        </div>
      </div>
    </div>
  );
}
