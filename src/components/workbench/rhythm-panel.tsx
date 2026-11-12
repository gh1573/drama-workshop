"use client";

import { Activity, Clapperboard, Gauge, ListChecks, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CAMERA_MOVEMENTS,
  NARRATIVE_META,
  type NarrativeFunction,
} from "@/lib/drama";
import { useWorkbench } from "@/store/workbench";

/**
 * 单集结构节奏分析 —— 对齐真实短剧工业化打点标准（v2.7 场次化剧本）：
 * - 场次时间占比（首场黄金 3 秒钩子，整集时长由拆镜档位决定）
 * - 情绪能量曲线（钩子蓄力 → 冲突爬升 → 反转/顶点爆发 → 高位留钩，按叙事功能的标准能量模型）
 * - 打点密度（真实短剧平均每镜头 3~6 秒、每 15~20 秒一次翻转）
 * - 工业达标清单（分镜密度 / 景别多样性 / 运镜多样性 / 金句卡点）
 */

const GOLDEN_MS: Record<NarrativeFunction, number> = {
  hook: 3000,
  buildup: 5000,
  twist: 4500,
  climax: 5000,
  cliffhanger: 4000,
};

const ENERGY: Record<NarrativeFunction, { v: number; label: string; note: string }> = {
  hook: { v: 55, label: "蓄力", note: "黄金 3 秒拉满情绪张力" },
  buildup: { v: 70, label: "爬升", note: "冲突层层加码，压迫感上行" },
  twist: { v: 85, label: "反转", note: "身份揭晓颠覆局势，预期落空" },
  climax: { v: 100, label: "爆发", note: "身份揭晓 / 打脸顶点，爽感拉满" },
  cliffhanger: { v: 78, label: "高位悬念", note: "不落地、留缺口，逼出下一集" },
};

function Meter({
  label,
  value,
  hint,
  good,
}: {
  label: string;
  value: number;
  hint: string;
  good: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
        <span
          className={`text-[10px] font-bold ${good ? "text-emerald-400" : "text-amber-400"}`}
        >
          {good ? "达标" : "建议加强"}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${
            good ? "from-emerald-500 to-teal-400" : "from-amber-500 to-orange-500"
          }`}
          style={{ width: `${Math.min(100, Math.max(6, value))}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{hint}</p>
    </div>
  );
}

export function RhythmPanel() {
  const beats = useWorkbench((s) => s.session?.beats ?? []);
  const clips = useWorkbench((s) => s.session?.clips ?? []);
  if (beats.length === 0) return null;

  const sorted = [...beats].sort((a, b) => a.index - b.index);

  // —— 时间占比：优先用拆解镜头的计划时长，无拆解回退黄金区间 ——
  const actMs = sorted.map((b) => {
    const group = clips.filter((c) => c.beatIndex === b.index);
    const sum = group.reduce((m, c) => m + (c.plannedMs ?? 0), 0);
    return sum > 0 ? sum : GOLDEN_MS[b.narrativeFunction];
  });
  const totalMs = actMs.reduce((a, b) => a + b, 0) || 12000;
  const totalSec = Math.round(totalMs / 100) / 10;

  // —— 打点密度：真实短剧平均每镜头 3~6 秒 ——
  const shotCount = clips.length || beats.length;
  const secPerShot = shotCount > 0 ? totalSec / shotCount : 0;
  const densityGood = shotCount >= 6 && secPerShot <= 6;

  // —— 景别 / 运镜多样性 ——
  const sizeSet = new Set(
    clips.map((c) => c.shotSize).filter((x): x is string => !!x)
  );
  const movementSet = new Set(
    [
      ...sorted.map((b) => b.cameraMovement),
      ...clips.map((c) => c.cameraMovement).filter((x): x is string => !!x),
    ].filter((m) => m in CAMERA_MOVEMENTS)
  );
  const sizeScore = sizeSet.size / 4; // 达标线：4 种景别
  const movementScore = movementSet.size / 5; // 达标线：5 种运镜

  // —— 金句卡点：每一场都有非空台词 ——
  const quoteGood = sorted.every((b) => b.dialogueSubtitle.trim().length > 0);

  // —— 能量曲线（SVG，宽度 100% viewBox 240x64） ——
  const pts = sorted.map((b, i) => {
    const x = 12 + (i * 216) / Math.max(1, sorted.length - 1);
    const y = 56 - (ENERGY[b.narrativeFunction].v / 100) * 44;
    return { x, y, fn: b.narrativeFunction };
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${path} L${pts[pts.length - 1]?.x ?? 12},60 L12,60 Z`;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold tracking-wide">单集结构节奏分析</h3>
        <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground">
          参照工业化打点标准 · 每镜头 3~6s · 每 15~20s 一翻转
        </Badge>
      </div>

      {/* 时间占比条 */}
      <div>
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          场次时间占比（总计 {totalSec}s）
        </p>
        <div className="flex h-7 overflow-hidden rounded-lg border border-border/60">
          {sorted.map((b, i) => {
            const pct = (actMs[i] / totalMs) * 100;
            const colors: Record<NarrativeFunction, string> = {
              hook: "bg-gradient-to-r from-amber-500 to-orange-500",
              buildup: "bg-gradient-to-r from-sky-500 to-blue-500",
              twist: "bg-gradient-to-r from-fuchsia-500 to-purple-500",
              climax: "bg-gradient-to-r from-rose-500 to-red-500",
              cliffhanger: "bg-gradient-to-r from-emerald-500 to-teal-500",
            };
            return (
              <div
                key={b.index}
                className={`flex items-center justify-center text-[10px] font-bold text-white ${colors[b.narrativeFunction]}`}
                style={{ width: `${pct}%` }}
                title={`${NARRATIVE_META[b.narrativeFunction].tag}：${Math.round(pct)}%（${Math.round(actMs[i] / 100) / 10}s）`}
              >
                {pct >= 12 ? `${NARRATIVE_META[b.narrativeFunction].label} ${Math.round(pct)}%` : ""}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          {sorted.map((b, i) => (
            <span key={b.index}>
              第{b.index}场 {Math.round(actMs[i] / 100) / 10}s
            </span>
          ))}
        </div>
      </div>

      {/* 情绪能量曲线 */}
      <div>
        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <Activity className="h-3 w-3" />
          情绪能量曲线（蓄力憋屈值 vs 爆发爽感值）
        </p>
        <svg viewBox="0 0 240 64" className="h-20 w-full" role="img" aria-label="情绪能量曲线">
          <defs>
            <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(251 146 60)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(251 146 60)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <line x1="8" y1="60" x2="232" y2="60" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
          <path d={area} fill="url(#energyFill)" />
          <path d={path} fill="none" stroke="rgb(251 146 60)" strokeWidth="2" strokeLinecap="round" />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3.2" fill="rgb(15 15 15)" stroke="rgb(251 146 60)" strokeWidth="1.6" />
              <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.75">
                {ENERGY[p.fn].label}
              </text>
            </g>
          ))}
        </svg>
        <div className="flex justify-between text-[10px] leading-tight text-muted-foreground">
          {sorted.map((b) => (
            <span key={b.index} className="max-w-[32%] text-center">
              第{b.index}场：{ENERGY[b.narrativeFunction].note}
            </span>
          ))}
        </div>
      </div>

      {/* 镜头级节奏带（v2.5.2 VLM 审计 P1）：宽=计划时长、高=情绪能量、
          pending 降饱和虚线——让「上重下空」的节奏页签有镜级可扫读层 */}
      {clips.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Clapperboard className="h-3 w-3" />
            镜头级节奏带（宽＝时长 · 高＝能量 · 共 {clips.length} 镜）
          </p>
          <div className="flex h-24 items-stretch gap-1 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2">
            {[...clips]
              .sort((a, b) => a.order - b.order)
              .map((c) => {
                const ms = c.plannedMs ?? 4000;
                const energy = c.energy ?? 50;
                const ready = c.status === "ready";
                return (
                  <div
                    key={c.id}
                    className="flex min-w-0 flex-col justify-end"
                    style={{ flex: `${ms} 1 0%` }}
                    title={`${c.name} · ${c.shotSize ?? "—"} · ${
                      Math.round(ms / 100) / 10
                    }s · 能量 ${energy}${ready ? "" : " · 待生成"}`}
                  >
                    <div
                      className={`w-full rounded-sm ${
                        ready
                          ? "bg-gradient-to-t from-amber-500/25 to-amber-400"
                          : "border border-dashed border-border/80 bg-muted/20"
                      }`}
                      style={{ height: `${Math.max(14, energy)}%` }}
                    />
                    <p className="mt-1 truncate text-center font-mono text-[9px] leading-3 text-muted-foreground">
                      {String(c.order + 1).padStart(2, "0")}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 工业达标清单 */}
      <div>
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <ListChecks className="h-3 w-3" />
          工业化达标清单
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Meter
            label={`打点密度 · ${shotCount} 镜头 / ${totalSec}s（${secPerShot ? Math.round(secPerShot * 10) / 10 : "—"}s/镜）`}
            value={densityGood ? 100 : (shotCount / 6) * 100}
            hint="真实短剧每集 10~20 分镜、单镜 3~6 秒；可用「AI 拆解分镜」加密打点"
            good={densityGood}
          />
          <Meter
            label={`景别多样性 · ${sizeSet.size} 种`}
            value={sizeScore * 100}
            hint="正反打要求远景/全景/中景/近景/特写交替；已达 4 种为佳"
            good={sizeScore >= 1}
          />
          <Meter
            label={`运镜多样性 · ${movementSet.size} 种`}
            value={movementScore * 100}
            hint="场次梯级调度 + 分镜表内逐镜切换可继续提升"
            good={movementScore >= 1}
          />
          <Meter
            label="金句卡点覆盖"
            value={quoteGood ? 100 : 66}
            hint="每一场都应有可直接上屏的封神台词"
            good={quoteGood}
          />
        </div>
      </div>
    </section>
  );
}
