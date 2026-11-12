"use client";

import { Lightbulb, Film, MonitorPlay } from "lucide-react";
import type { ReactNode } from "react";

/**
 * 配置步骤卡统一外壳（v2.8：去掉 01/02/03 序号）。
 *
 * VLM 走查 P0：左栏配置步骤与右栏流水线阶段共用「01」起编的双编号系统，
 * 用户极易误读为「左 01 对应右 01」。编号语义唯一化——
 * 数字序号只保留给右侧「AI 剧组 01~05 阶段」；左栏输入项靠堆叠顺序自明。
 */
export function StepCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3.5 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <h2 className="text-sm font-bold tracking-wide">{title}</h2>
        <span className="ml-auto text-muted-foreground/70">
          {icon ?? <Lightbulb className="h-4 w-4" />}
        </span>
      </div>
      {children}
    </section>
  );
}

export const STEP_ICONS = {
  genre: <Lightbulb className="h-4 w-4" />,
  synopsis: <Film className="h-4 w-4" />,
  config: <MonitorPlay className="h-4 w-4" />,
};
