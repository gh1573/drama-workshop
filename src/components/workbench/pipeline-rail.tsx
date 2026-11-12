"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  CREW_ROLES,
  RUN_STAGES,
  type RunDTO,
  type StageStatus,
} from "@/lib/drama";
import type { WorkbenchSession } from "@/store/workbench";

/**
 * AI 剧组流水线导轨（v2.6）—— 会话态页签上方的常驻五阶段进度导航。
 *
 * 设计动机：v2.5 前「流水线」只活在剧组进程页签里，用户在其他页签工作时
 * 对流水线位置零感知，只能靠左列折叠条上的百分比数字想象。
 * 导轨把 01-05 阶段变成可点击的「生产进度条 + 快捷导航」：
 * - pending 灰点 / running amber 呼吸 / succeeded emerald 勾 / failed 红叉
 * - 已完成阶段展示产物计数（3 幕 / 8 资产 / 24 镜…），抽象阶段变成可验证产出
 * - 点击阶段直达其产物页签；运行中阶段点击 → 剧组进程看实时日志
 *
 * 无 run（仅快速推演后保存的项目）时导轨全灰待开机，仍可作页签快捷导航。
 */

/** 阶段 → 产物所在页签（运行中一律去剧组进程看日志） */
const STAGE_TAB: Record<string, "cut" | "script" | "assets" | "rhythm"> = {
  screenwriting: "script",
  casting: "assets",
  directing: "script",
  anchoring: "script",
  postproduction: "cut",
};

/**
 * 阶段产物计数（v2.6 与 crew-pipeline-panel 阶段卡同源，禁止两处口径漂移）。
 * 返回 null = 该阶段尚无可展示产物。
 */
export function stageArtifact(
  stageKey: string,
  session: WorkbenchSession | null
): string | null {
  if (!session) return null;
  switch (stageKey) {
    case "screenwriting": {
      const n = session.beats.length;
      return n > 0 ? `${n} 幕` : null;
    }
    case "casting": {
      const n = session.assets.length;
      return n > 0 ? `${n} 资产` : null;
    }
    case "directing": {
      const n = session.clips.length;
      return n > 0 ? `${n} 镜` : null;
    }
    case "anchoring": {
      const total = session.clips.length;
      const anchored = session.clips.filter((c) => c.finalPrompt).length;
      /* v2.6 VLM 复审：阶段名已含「锚定」，计数不再带单位避免同位重复（「锚定组装 10/10 锚定」） */
      return total > 0 ? `${anchored}/${total}` : null;
    }
    case "postproduction":
      /* v2.6 VLM 复审：「后期成包」阶段的产物事实 = 可下载的成片文件 */
      return session.finalVideoUrl
        ? "成片可下载"
        : (() => {
            const total = session.clips.length;
            if (total === 0) return null;
            const ready = session.clips.filter((c) => c.status === "ready").length;
            return `${ready}/${total} 镜就绪`;
          })();
    default:
      return null;
  }
}

function StageNode({ status, running }: { status: StageStatus; running: boolean }) {
  if (status === "running")
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400" />;
  if (status === "succeeded")
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
  if (status === "failed")
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />;
  return (
    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          running ? "bg-amber-400/50" : "bg-muted-foreground/40"
        }`}
      />
    </span>
  );
}

export function PipelineRail({
  run,
  session,
  onNavigate,
}: {
  run: RunDTO | null;
  session: WorkbenchSession | null;
  onNavigate: (tab: "cut" | "script" | "assets" | "rhythm" | "pipeline") => void;
}) {
  const running = run?.status === "running";

  return (
    <nav
      aria-label="制作流水线阶段导航"
      className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card/60 px-2.5 py-2"
    >
      {RUN_STAGES.map((def, i) => {
        const stage = run?.stages.find((s) => s.key === def.key);
        const status: StageStatus = stage?.status ?? "pending";
        const role = CREW_ROLES[def.role];
        const artifact =
          status === "succeeded" ? stageArtifact(def.key, session) : null;
        const tab = status === "running" ? "pipeline" : STAGE_TAB[def.key];
        return (
          <div key={def.key} className="flex shrink-0 items-center">
            {i > 0 && (
              /* 连接线：已完成段填充品牌色，未完成段中性（进度即形状） */
              <span
                aria-hidden
                className={`mx-0.5 h-px w-3 sm:w-4 ${
                  status === "succeeded" || status === "running"
                    ? "bg-gradient-to-r from-rose-500/60 to-amber-500/60"
                    : "bg-border"
                }`}
              />
            )}
            <button
              onClick={() => onNavigate(tab)}
              title={`${role.name} · ${role.duty}\n点击查看${
                status === "running" ? "实时进度与日志" : "该阶段产物"
              }`}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-secondary/60 ${
                status === "running" ? "bg-amber-500/10" : ""
              }`}
            >
              <span className="font-mono text-[10px] font-bold text-muted-foreground/70">
                0{i + 1}
              </span>
              <StageNode status={status} running={running} />
              <span
                className={`whitespace-nowrap text-[11px] font-semibold leading-none ${
                  status === "running"
                    ? "text-amber-300"
                    : status === "failed"
                      ? "text-rose-300"
                      : "text-foreground/85"
                }`}
              >
                {def.name}
              </span>
              {artifact && (
                /* v2.6 VLM 复审：计数 9px——1728 视口下五阶段+计数必须完整放入
                    右列内宽（原溢出横向滚动致「05 后期成包」截断） */
                <span className="whitespace-nowrap font-mono text-[9px] leading-none text-muted-foreground">
                  {artifact}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
