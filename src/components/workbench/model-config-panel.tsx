"use client";

import { MonitorPlay, Wand2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DURATIONS, RESOLUTIONS, THINKING_LEVELS, VIDEO_MODELS } from "@/lib/genres";
import { useWorkbench } from "@/store/workbench";
import { StepCard } from "./step-card";

/** 第三步 · 模型配置（基模切换联动时长/分辨率默认值） */
export function ModelConfigPanel() {
  const modelConfig = useWorkbench((s) => s.modelConfig);
  const patchModelConfig = useWorkbench((s) => s.patchModelConfig);

  function handleVideoModelChange(value: string) {
    if (value === "Omni 1.2 Pro") {
      patchModelConfig({ videoModel: value, durationSeconds: 8, resolution: "1080p" });
    } else {
      patchModelConfig({ videoModel: value, durationSeconds: 5, resolution: "720p" });
    }
  }

  return (
    <StepCard
      step="第三步"
      title="模型配置"
      icon={<MonitorPlay className="h-4 w-4" />}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
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
          <Label className="text-xs text-muted-foreground">剧本思考深度</Label>
          <Select
            value={modelConfig.scriptThinkingLevel}
            onValueChange={(v) =>
              patchModelConfig({
                scriptThinkingLevel: v as "low" | "medium" | "high",
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
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">单镜时长</Label>
          <Select
            value={String(modelConfig.durationSeconds)}
            onValueChange={(v) => patchModelConfig({ durationSeconds: Number(v) })}
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
            onValueChange={(v) => patchModelConfig({ resolution: v })}
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
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/30 px-3 py-2.5">
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
          onCheckedChange={(v) => patchModelConfig({ enablePromptEnhance: v })}
        />
      </div>
    </StepCard>
  );
}
