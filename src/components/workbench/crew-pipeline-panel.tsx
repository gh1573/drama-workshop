"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Camera,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  Loader2,
  RotateCcw,
  Video,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  CREW_ROLES,
  RUN_STAGES,
  RUN_STATUS,
  TASK_KIND_META,
  TASK_STATUS,
  type RunStageInfo,
} from "@/lib/drama";
import { useWorkbench } from "@/store/workbench";
import { stageArtifact } from "./pipeline-rail";

/**
 * AI 剧组流水线面板 —— 「全组开机」的生产观测中心。
 * 展示：五阶段进度（编剧/选角/导演/场记/后期，同 RUN_STAGES；制片立项是
 * 落地页的用户动作，不属于 run 编排，不在本面板显示）、剧组日志、渲染任务中心。
 * 数据全部来自 activeRun 与 tasks（REST 轮询），组件不含任何轮询逻辑。
 */

function clockOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function StageIcon({ status }: { status: RunStageInfo["status"] }) {
  if (status === "succeeded")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (status === "running")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />;
  if (status === "failed")
    return <XCircle className="h-4 w-4 shrink-0 text-rose-400" />;
  return <span className="mx-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />;
}

export function CrewPipelinePanel() {
  const { toast } = useToast();
  const session = useWorkbench((s) => s.session);
  const run = useWorkbench((s) => s.activeRun);
  const tasks = useWorkbench((s) => s.tasks);
  const pipelineStarting = useWorkbench((s) => s.pipelineStarting);
  const startPipeline = useWorkbench((s) => s.startPipeline);
  const retryPipeline = useWorkbench((s) => s.retryPipeline);
  const retryingPipeline = useWorkbench((s) => s.retryingPipeline);
  const retryTask = useWorkbench((s) => s.retryTask);
  const cancelTask = useWorkbench((s) => s.cancelTask);
  const taskActionBusy = useWorkbench((s) => s.taskActionBusy);
  // §7.13 v2.5.2：已有 run 时的重开为破坏性重写，需二次确认
  const [rerunConfirmOpen, setRerunConfirmOpen] = useState(false);

  const assetNameById = useMemo(
    () => new Map((session?.assets ?? []).map((a) => [a.id, a.name])),
    [session?.assets]
  );
  const clipNameById = useMemo(
    () => new Map((session?.clips ?? []).map((c) => [c.id, c.name])),
    [session?.clips]
  );

  if (!session) return null;

  const running = run?.status === "running";
  const failed = run?.status === "failed";
  const succeeded = run?.status === "succeeded";
  const journal = run ? [...run.journal].reverse() : [];
  const activeTasks = tasks.filter(
    (t) => t.status === "queued" || t.status === "running"
  );

  async function handleStart() {
    const ok = await startPipeline();
    if (ok) {
      toast({
        title: "剧组已开机",
        description: "编剧 → 选角定妆 → 导演拆镜 → 场记锚定 → 后期成包，进度见下方流水线",
      });
    } else {
      toast({
        title: "开机失败",
        description: useWorkbench.getState().lastError ?? "请稍后重试",
        variant: "destructive",
      });
    }
  }

  async function handleRetry() {
    const ok = await retryPipeline();
    toast({
      title: ok ? "断点续拍已启动" : "续拍失败",
      description: ok
        ? "已完成阶段自动跳过，从首个未成功阶段继续"
        : (useWorkbench.getState().lastError ?? "请稍后重试"),
      variant: ok ? "default" : "destructive",
    });
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      {/* —— 标题行 —— */}
      <div className="flex flex-wrap items-center gap-2">
        <Clapperboard className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold tracking-wide">AI 剧组流水线</h3>
        {run ? (
          <Badge variant="outline" className={`text-[10px] ${RUN_STATUS[run.status].cls}`}>
            {RUN_STATUS[run.status].label}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] border-zinc-500/40 text-zinc-400">
            待开机
          </Badge>
        )}
        {/* v2.6 VLM 复审：删去「制片 → 编剧 → …」文字链——与下方阶段卡信息重复 */}
      </div>

      {/* —— 进度条 —— */}
      {run && (
        <div className="space-y-1.5">
          <Progress value={run.progress} className="h-2" />
          <p className="text-right text-[10px] font-mono text-muted-foreground">
            {run.progress}% · 当前：{RUN_STAGES.find((d) => d.key === run.stage)?.name ?? run.stage}
          </p>
        </div>
      )}

      {/* —— 阶段轨道 —— */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {RUN_STAGES.map((def) => {
          const stage = run?.stages.find((s) => s.key === def.key);
          const status = stage?.status ?? "pending";
          const roleName = CREW_ROLES[def.role]?.name ?? def.role;
          /* v2.6：已完成阶段展示产物计数（与页签上方导轨同源 stageArtifact，禁止两处口径漂移）
             ——抽象阶段变成可验证产出 */
          const artifact =
            status === "succeeded" ? stageArtifact(def.key, session) : null;
          return (
            <div
              key={def.key}
              className={`space-y-1 rounded-lg border p-2.5 ${
                status === "running"
                  ? "border-amber-500/50 bg-amber-500/5"
                  : status === "failed"
                    ? "border-rose-500/50 bg-rose-500/5"
                    : status === "succeeded"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-border/60 bg-secondary/20"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <StageIcon status={status} />
                <p className="min-w-0 flex-1 truncate text-xs font-bold">{def.name}</p>
                {artifact && (
                  <span className="shrink-0 font-mono text-[10px] leading-none text-muted-foreground">
                    {artifact}
                  </span>
                )}
              </div>
              {/* §7.13 色彩纪律：岗位色降级为数据层属性，卡片渲染统一中性 */}
              <p className="text-[10px] text-muted-foreground">{roleName}</p>
              {stage?.error && (
                <p className="truncate text-[10px] text-rose-400" title={stage.error}>
                  {stage.error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* —— 剧组日志 —— */}
      {run && (
        <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-border/60 bg-secondary/20 p-3">
          {journal.length === 0 ? (
            /* v2.6：刚开机 journal 为空时的防呆占位（原空白容器像渲染失败） */
            <p className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              剧组动员中，第一帧日志即将就位…
            </p>
          ) : (
            journal.map((entry, i) => {
              /* §7.13 P0：journal 为 DB JSON 直读，role 键可能失效/缺失/脏数据 —— 防御式降级，禁止裸取 */
              const roleName =
                CREW_ROLES[entry.role as keyof typeof CREW_ROLES]?.name ?? "剧组";
              return (
                <div key={`${entry.at}-${i}`} className="flex items-start gap-2 text-xs">
                  <span className="inline-block w-[52px] shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
                    {clockOf(entry.at)}
                  </span>
                  {/* v2.6 VLM 复审：角色词中性 chip 定宽成列，日志形成可纵向扫描的「角色列」 */}
                  <span className="inline-block w-12 shrink-0 truncate rounded bg-secondary/70 px-1 text-center text-[10px] font-semibold leading-5 text-foreground/75">
                    {roleName}
                  </span>
                  <span className="min-w-0 flex-1 text-foreground/85">{entry.message}</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* —— 操作区 —— */}
      <div className="space-y-2.5">
        {/* v2.6 VLM 复审：就绪说明独立成行（原与危险按钮同行 ml-auto 混排，
            危险 CTA 视觉分量不足且两信息无分组关系） */}
        {succeeded && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            制作包已就绪：分镜表 · 资产定妆 · 镜头提示词 · 三轨 · 能量曲线，可导出交付
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
        {!run || succeeded ? (
          run ? (
            /* §7.13 v2.5.2：已有成片的重开 = 破坏性重写 → 危险描边 + 二次确认
               （VLM 审计 P0：与保存同视觉语言易误触）；首次开机保留品牌渐变 */
            <>
              <Button
                size="sm"
                onClick={() => setRerunConfirmOpen(true)}
                disabled={pipelineStarting || running}
                className="border border-red-500/40 bg-transparent font-bold text-red-300 shadow-none hover:bg-red-500/10 hover:text-red-200"
              >
                {pipelineStarting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                重新开机（重写剧本与分镜）
              </Button>
              <AlertDialog
                open={rerunConfirmOpen}
                onOpenChange={(o) => {
                  /* v2.9.10：开机指令在途时不允许误关（弹窗内等落定） */
                  if (!o && !pipelineStarting) setRerunConfirmOpen(false);
                }}
              >
                <AlertDialogContent className="border-t-2 border-t-red-500/70">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                      确认重新开机？
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      将重写当前项目的剧本、分镜与锚点，资产定妆与引用关系会被重建；
                      已合成成片与任务历史保留。此操作不可撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pipelineStarting}>再想想</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault(); // 等指令落定再关弹窗（成败 toast 由 handleStart 播报）
                        void handleStart().finally(() => setRerunConfirmOpen(false));
                      }}
                      disabled={pipelineStarting}
                      className="bg-red-600 text-white hover:bg-red-500"
                    >
                      {pipelineStarting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Clapperboard className="h-4 w-4" />
                      )}
                      {pipelineStarting ? "开机中…" : "重写并开机"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleStart}
              disabled={pipelineStarting || running}
              className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 font-bold text-white hover:opacity-90"
            >
              {pipelineStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clapperboard className="h-4 w-4" />
              )}
              全组开机 · 从梗概到制作包
            </Button>
          )
        ) : null}
        {failed && (
          <Button
            size="sm"
            onClick={handleRetry}
            disabled={retryingPipeline}
            className="border border-amber-500/40 bg-amber-500/10 font-semibold text-amber-400 hover:bg-amber-500/20"
          >
            {/* v2.9.10：续拍在途态——run 失败后用户最急的时刻，
                无禁用可连点双发 retry（审计 P1） */}
            {retryingPipeline ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {retryingPipeline ? "续拍启动中…" : "断点续拍"}
          </Button>
        )}
        {running && (
          <p className="flex items-center gap-1.5 text-xs text-amber-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            全组拍摄中，请勿离开本页（断线重进可自动恢复观测）
          </p>
        )}
        {failed && run?.error && (
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={run.error}>{run.error}</span>
          </p>
        )}
        </div>
      </div>

      {/* —— 渲染任务中心 —— */}
      {tasks.length > 0 && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2">
            {/* v2.6 VLM 复审：任务类型图标统一中性——颜色只区分状态（徽标），不区分类型 */}
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-bold">渲染任务中心</p>
            {activeTasks.length > 0 && (
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                {activeTasks.length} 个进行中
              </Badge>
            )}
          </div>
          <TooltipProvider delayDuration={200}>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {tasks.slice(0, 12).map((task) => {
                const st = TASK_STATUS[task.status];
                const kind = TASK_KIND_META[task.kind];
                const targetName =
                  task.kind === "portrait"
                    ? (assetNameById.get(String(task.payload.assetId ?? "")) ?? "资产")
                    : (clipNameById.get(String(task.payload.clipId ?? "")) ?? "镜头");
                return (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-secondary/20 px-2.5 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {task.kind === "portrait" ? (
                        <Camera className="mr-1 inline h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Video className="mr-1 inline h-3 w-3 text-muted-foreground" />
                      )}
                      {kind.label} · {targetName}
                    </span>
                    <span
                      className="font-mono text-[10px] text-muted-foreground/70"
                      title={task.createdAt}
                    >
                      {clockOf(task.createdAt)}
                    </span>
                    {task.attempts > 1 && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        第 {task.attempts} 次
                      </span>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${st.cls}`}>
                      {st.label}
                    </Badge>
                    {task.error && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="h-3.5 w-3.5 cursor-help text-rose-400" />
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-64 text-xs">
                          {task.error}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {task.resultUrl && (
                      <a
                        href={task.resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="查看产物"
                        className="rounded-md p-0.5 text-emerald-400 hover:bg-emerald-500/10"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {(task.status === "queued" || task.status === "running") && (
                      <button
                        aria-label="取消任务"
                        disabled={Boolean(taskActionBusy[task.id])}
                        onClick={() => {
                          /* v2.9.10：取消失败不能静默——用户在止损，点了没反应是最差体验 */
                          void cancelTask(task.id).then((err) => {
                            if (err)
                              toast({ title: "取消未成功", description: err, variant: "destructive" });
                          });
                        }}
                        className="rounded-md p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        {taskActionBusy[task.id] === "cancel" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    {(task.status === "failed" || task.status === "cancelled") && (
                      <button
                        aria-label="重试任务"
                        disabled={Boolean(taskActionBusy[task.id])}
                        onClick={() => {
                          /* v2.9.10：官方指定的失败恢复入口，重试失败要报 */
                          void retryTask(task.id).then((err) => {
                            if (err)
                              toast({ title: "重试未成功", description: err, variant: "destructive" });
                          });
                        }}
                        className="rounded-md p-0.5 text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
                      >
                        {taskActionBusy[task.id] === "retry" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
              {/* v2.9.7 溢出计数（E2E 走查：一键渲染 15 镜 + 配音 = 30+ 任务，
                  静默截断 12 条像「任务丢了」） */}
              {tasks.length > 12 && (
                <p className="pt-0.5 text-center font-mono text-[10px] text-muted-foreground">
                  还有 {tasks.length - 12} 个任务未展示（共 {tasks.length}，最新在上）
                </p>
              )}
            </div>
          </TooltipProvider>
        </div>
      )}
    </section>
  );
}
