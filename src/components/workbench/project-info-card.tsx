"use client";

import { FileJson, FileText, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  PROJECT_STATUS,
  buildMarkdown,
  downloadFile,
  formatLocalTime,
  toExportData,
} from "@/lib/drama";
import { sessionToDetail, useWorkbench } from "@/store/workbench";

/** 工程信息卡：项目概览 + 保存到项目库 + 双格式导出 */
export function ProjectInfoCard() {
  const { toast } = useToast();
  const session = useWorkbench((s) => s.session);
  const saving = useWorkbench((s) => s.saving);
  const saveProject = useWorkbench((s) => s.saveProject);

  if (!session) return null;
  const detail = sessionToDetail(session);
  const exportData = toExportData(detail);

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
        <Badge className={`border-0 bg-gradient-to-r ${session.genre.gradient} text-white`}>
          {session.genre.icon} {session.genre.name}
        </Badge>
        <Badge variant="outline">{session.genre.badge}</Badge>
        <Badge variant="outline" className="border-amber-500/40 text-amber-400">
          {PROJECT_STATUS[session.status]}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          导出时间 {formatLocalTime()}
        </span>
      </div>

      <p className="text-sm font-semibold">{session.title}</p>
      <p className="text-sm leading-relaxed text-foreground/90">
        <span className="font-semibold text-amber-400">梗概：</span>
        {session.synopsis}
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          ["画幅", detail.aspectRatio],
          ["视频基模", session.modelConfig.videoModel],
          ["单镜", `${session.modelConfig.durationSeconds}s / ${session.modelConfig.resolution}`],
          ["思考深度", session.modelConfig.scriptThinkingLevel],
          ["提示词增强", session.modelConfig.enablePromptEnhance ? "开启" : "关闭"],
          ["分镜幕数", `${session.beats.length} 幕`],
          ["镜头片段", `${session.clips.length} 个`],
          ["产出状态", exportData.statistics.hasSynthesizedOutput ? "已合成" : "待生成"],
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-auto border border-emerald-500/40 bg-emerald-500/10 px-2 py-2 text-xs font-semibold leading-snug text-emerald-400 hover:bg-emerald-500/20"
        >
          {saving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Save className="h-4 w-4 shrink-0" />}
          <span className="whitespace-normal">{session.dbId ? "更新项目" : "保存到项目库"}</span>
        </Button>
        <Button
          onClick={exportJson}
          className="h-auto border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-xs font-semibold leading-snug text-amber-400 hover:bg-amber-500/20"
        >
          <FileJson className="h-4 w-4 shrink-0" />
          <span className="whitespace-normal">导出 JSON 工程</span>
        </Button>
        <Button
          onClick={exportMd}
          className="h-auto border border-rose-500/40 bg-rose-500/10 px-2 py-2 text-xs font-semibold leading-snug text-rose-400 hover:bg-rose-500/20"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="whitespace-normal">导出 MD 清单</span>
        </Button>
      </div>
    </div>
  );
}
