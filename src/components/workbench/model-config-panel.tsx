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
import {
  durationCrewLabel,
  resolutionCrewLabel,
} from "@/lib/drama";
import { DURATIONS, RESOLUTIONS, THINKING_LEVELS, VIDEO_MODELS } from "@/lib/genres";
import { useWorkbench } from "@/store/workbench";
import { StepCard } from "./step-card";

/**
 * 第三步 · 拍摄配置（v2.9.3 用户语言化：AI 剧组用剧组语言讲模型参数）。
 * 机组切换联动时长/规格默认值——机组决定默认拍摄规格，专业语义不变。
 */
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
      title="拍摄配置"
      icon={<MonitorPlay className="h-4 w-4" />}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">拍摄机组</Label>
          <Select
            value={modelConfig.videoModel}
            onValueChange={handleVideoModelChange}
          >
            <SelectTrigger className="w-full border-border/70 bg-secondary/30">
              {/* v2.9.12：触发器用短标签——完整剧组语言含括号规格说明，
                  半宽触发器硬截出现「Flash (」残括号；完整释义保留在下拉选项里 */}
              <SelectValue>
                {VIDEO_MODELS.find((m) => m.id === modelConfig.videoModel)?.trigger ??
                  modelConfig.videoModel}
              </SelectValue>
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
          <Label className="text-xs text-muted-foreground">编剧室深度</Label>
          <Select
            value={modelConfig.scriptThinkingLevel}
            onValueChange={(v) =>
              patchModelConfig({
                scriptThinkingLevel: v as "low" | "medium" | "high",
              })
            }
          >
            <SelectTrigger className="w-full border-border/70 bg-secondary/30">
              <SelectValue>
                {THINKING_LEVELS.find(
                  (t) => t.id === modelConfig.scriptThinkingLevel,
                )?.trigger ?? modelConfig.scriptThinkingLevel}
              </SelectValue>
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
                  {durationCrewLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">成片规格</Label>
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
                  {resolutionCrewLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/30 px-3 py-2.5">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Wand2 className="h-3.5 w-3.5 text-amber-400" />
            导演讲戏
          </p>
          <p className="text-xs text-muted-foreground">
            每镜自动补写英文电影级镜头语言（运镜/光影/质感）
          </p>
        </div>
        <Switch
          checked={modelConfig.enablePromptEnhance}
          onCheckedChange={(v) => patchModelConfig({ enablePromptEnhance: v })}
        />
      </div>
      {/* v2.9.5（VLM 16 视图走查：多视图指出拍摄配置引发「必选项」认知焦虑——
          与顶部「全组开机后 AI 自动执行」的心智打架）：明确这是可选的进阶微调，
          默认配置即可直接开机；剧组语言保留（v2.9.3 原则），只补消除焦虑的一句 */}
      <p className="text-left text-[11px] leading-relaxed text-muted-foreground">
        进阶微调 · 拿不准就用默认机组直接开机，配置随时可改，不影响已生成内容
      </p>
    </StepCard>
  );
}
