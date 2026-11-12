"use client";

import { Lightbulb, Film, MonitorPlay } from "lucide-react";
import type { ReactNode } from "react";

/** 三步配置卡的统一外壳（§7.13：序号与右栏流水线 01-05 统一为 mono 等宽语言） */
export function StepCard({
  step,
  title,
  icon,
  children,
}: {
  step: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3.5 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs font-bold text-amber-500/90">{step}</span>
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
