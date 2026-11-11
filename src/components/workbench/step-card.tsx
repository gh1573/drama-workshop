"use client";

import { Lightbulb, Film, MonitorPlay } from "lucide-react";
import type { ReactNode } from "react";

/** 三步配置卡的统一外壳 */
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
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {step}
        </span>
        <h2 className="text-sm font-bold tracking-wide">{title}</h2>
        <span className="ml-auto text-amber-400">
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
