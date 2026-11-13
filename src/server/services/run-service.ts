import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import {
  NARRATIVE_META,
  RUN_STAGES,
  type AssetKind,
  type CrewRoleKey,
  type RunDTO,
  type RunLogEntry,
  type RunStageInfo,
  type ShotBreakdownItem,
  type StoryBeat,
} from "@/lib/drama";
import { getTextProvider, parseJsonLoose } from "@/server/providers";
import type { RetryNotice } from "@/server/providers/types";
import { stageFailureText } from "@/lib/humanize-error";
import { composeVideoPrompt } from "@/server/engines/prompt-engine";
import { ORPHAN_RECOVERY_WINDOW_MS } from "@/config/runtime";
import {
  CASTING_FACE_RULE,
  ETHNICITY_FALLBACK,
  ETHNICITY_KEYWORDS,
} from "@/config/templates";
import { breakdownAct } from "./breakdown-service";
import {
  buildScreenplayMessages,
  parseScreenplayBeats,
} from "./screenplay";
import {
  replaceActClips,
  updateBeatEnergy,
  updateProject,
} from "./project-service";
import type { ProductionRun, Project, StoryBeat as DbBeat } from "@prisma/client";

/**
 * 剧组流水线服务 —— 「AI 剧组」的编排核心。
 *
 * 产品定位：不是视频生成器，而是一条剧组流水线——
 * 制片立项 → 编剧场次剧本 → 选角定妆 → 导演拆镜 → 场记锚定 → 后期成包。
 * 普通用户不慬运镜/景别/轴线，也能拿到专业级制作包。
 *
 * 工程语义：
 * - 每个阶段幂等（断点重试从首个未成功阶段继续）；
 * - 阶段快照 + 剧组日志持久化，前端轮询即可获得完整生产观测；
 * - LLM 调用全部经 Provider 通道（解析级重试 3 次，第 3 级降载防截断）；
 * - 编剧提示词与解析统一在 screenplay.ts（v2.7 单一提示词源）。
 */

type StageKey = string;

interface StageResult {
  summary: string;
}

/** 解析失败错误：message 给 UI 人话（不贴原始 JSON），
 *  detail（原始输出摘要）由阶段编排落进剧组日志供诊断 —— 对齐 BreakdownError 约定。
 *  v2.9.11：此前 stage.error 直接携带 120 字符截断 JSON，
 *  阶段卡/警示条/日志三处同屏刷一坨代码，用户视角毫无信息量 */
class ParseFailError extends Error {
  detail: string;
  constructor(message: string, detail: string) {
    super(message);
    this.detail = detail;
  }
}

/** 解析级重试的用户指令（逐级收紧；第 3 级显式降载以避开输出截断，
 *  对齐分镜阶段 BREAKDOWN_RETRY_HINTS 的最佳实践） */
const SCREENPLAY_RETRY_HINTS = [
  "", // 首次：使用原始提示词
  "上一次输出无法解析。请严格只输出一个合法 JSON 对象（含 storyBeats 数组），不要任何其他文字。",
  '前两次输出都无法解析。只输出一个合法 JSON 对象 {"storyBeats":[...]}：所有字符串值一律单行（换行用 \\n 转义）、每场 description 与 dialogueSubtitle 精简到 60 字以内、不要尾逗号，确保 JSON 完整闭合。',
];

const CASTING_RETRY_HINTS = [
  "请建立资产库并只输出 JSON。",
  "上一次输出无法解析。请严格只输出一个合法 JSON 对象（characters/scenes/props 三个数组），不要任何其他文字。",
  '前两次输出都无法解析。只输出一个合法 JSON 对象 {"characters":[],"scenes":[],"props":[]}：所有字符串值一律单行、每个 visualAnchor 精简到 40 字以内、不要尾逗号，确保 JSON 完整闭合。',
];

const STAGE_START_MESSAGE: Record<string, string> = {
  screenwriting: "领取任务：围绕黄金 3 秒钩子推演场次剧本（节奏模式：{mode}）",
  casting: "通读场次剧本，提取角色 / 场景 / 道具，逐一完成定妆锁定",
  directing: "逐场拆解分镜：正反打节奏、景别交替、运镜梯级调度",
  anchoring: "按「角色段 → 场景段 → 道具段 → 动作段 → 运镜段 → 影调段」组装每镜提示词",
  postproduction: "字幕 / 音效 / 配乐三轨落轨，生成情绪能量曲线",
};

// ============================================================
// 行映射与解析
// ============================================================

function parseStages(raw: string): RunStageInfo[] {
  try {
    const parsed = JSON.parse(raw) as RunStageInfo[];
    if (Array.isArray(parsed) && parsed.length === RUN_STAGES.length) {
      return parsed;
    }
  } catch {
    /* fallthrough */
  }
  return freshStages();
}

function parseJournal(raw: string): RunLogEntry[] {
  try {
    const parsed = JSON.parse(raw) as RunLogEntry[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fallthrough */
  }
  return [];
}

function freshStages(): RunStageInfo[] {
  return RUN_STAGES.map((def) => ({
    key: def.key,
    name: def.name,
    role: def.role,
    status: "pending",
    startedAt: null,
    finishedAt: null,
    error: null,
  }));
}

function toRunDTO(row: ProductionRun): RunDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as RunDTO["status"],
    progress: row.progress,
    stage: row.stage,
    stages: parseStages(row.stages),
    journal: parseJournal(row.journal),
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ============================================================
// 持久化小件
// ============================================================

async function loadRun(runId: string): Promise<ProductionRun> {
  const row = await db.productionRun.findUnique({ where: { id: runId } });
  if (!row) throw new RouteError("流水线运行不存在", 404);
  return row;
}

/**
 * v2.9.13 长调用心跳（用户视角走查 P1）：编剧/拆镜单次 LLM 调用最长可达
 * 分钟级（限流退避更甚），期间 journal 零更新 = 用户「半盲等」。
 * 心跳每 30s 写一条进行中文案，让用户看到剧组在干活。
 * 调用异常时 finally 清理定时器；心跳不抛错（appendLog 失败不影响主流程）。
 */
async function heartbeat(
  runId: string,
  role: CrewRoleKey,
  label: string,
  t0: number
): Promise<void> {
  const elapsed = Math.round((Date.now() - t0) / 1000);
  try {
    await appendLog(
      runId,
      role,
      `${label}（已耗时 ${elapsed}s，AI 创作需要时间，请稍候）`
    );
  } catch {
    // 心跳失败不影响主流程
  }
}

function startHeartbeat(
  runId: string,
  role: CrewRoleKey,
  label: string
): () => void {
  const t0 = Date.now();
  const timer = setInterval(
    () => void heartbeat(runId, role, label, t0),
    30_000
  );
  return () => clearInterval(timer);
}

/**
 * v2.9.13 通道重试事件 → 剧组日志（用户视角走查 P0）：
 * 限流退避 20s/40s/80s 最长静默 140s+，不写日志用户就不知道系统在自救。
 */
function retryToLog(
  runId: string,
  role: CrewRoleKey,
  label: string
): (info: RetryNotice) => void {
  return (info) => {
    const sec = Math.round(info.waitMs / 1000);
    const msg =
      info.kind === "rate_limit"
        ? `${label}：AI 创作通道繁忙（上游限流），${sec}s 后自动重试（第 ${info.attempt} 轮）`
        : `${label}：通道瞬时异常，0.5s 后自动重试（第 ${info.attempt} 次）`;
    void appendLog(runId, role, msg).catch(() => undefined);
  };
}

async function appendLog(
  runId: string,
  role: CrewRoleKey,
  message: string
): Promise<void> {
  const row = await db.productionRun.findUnique({
    where: { id: runId },
    select: { journal: true },
  });
  const journal = parseJournal(row?.journal ?? "[]");
  journal.push({ at: new Date().toISOString(), role, message });
  // 日志上限 200 条，防止极端情况无限膨胀
  const trimmed = journal.slice(-200);
  await db.productionRun.update({
    where: { id: runId },
    data: { journal: JSON.stringify(trimmed) },
  });
}

async function patchStages(
  runId: string,
  stages: RunStageInfo[]
): Promise<void> {
  await db.productionRun.update({
    where: { id: runId },
    data: { stages: JSON.stringify(stages) },
  });
}

async function recomputeProgress(runId: string): Promise<void> {
  const row = await loadRun(runId);
  const stages = parseStages(row.stages);
  const done = stages
    .filter((s) => s.status === "succeeded")
    .reduce(
      (sum, s) =>
        sum + (RUN_STAGES.find((d) => d.key === s.key)?.weight ?? 0),
      0
    );
  const total = RUN_STAGES.reduce((sum, d) => sum + d.weight, 0);
  await db.productionRun.update({
    where: { id: runId },
    data: { progress: Math.min(100, Math.round((done / total) * 100)) },
  });
}

// ============================================================
// 编剧阶段（v2.7：提示词与解析统一在 screenplay.ts，此处只做编排）
// ============================================================

function thinkingModeLabel(level: string): string {
  if (level === "high") return "伏笔回收";
  if (level === "medium") return "节奏铺垫";
  return "直给爆点";
}

/** 编剧阶段（导出仅供验证脚本直测 keep 分支；生产调用走 STAGE_FN 编排） */
export async function stageScreenwriting(
  runId: string,
  project: Project,
  opts?: { keepScript?: boolean }
): Promise<StageResult> {
  /* v2.9.6 剧本过稿开机（传统剧组纪律：剧本定稿开机不重写）——
     「先试笔」产出的剧本用户已过目，「满意再全组开机」的承诺必须兑现：
     keepScript 且项目已有剧本时，编剧室本轮不重写，直接交稿进选角。
     已知边界：客户端 keepScript 由「会话剧本 ↔ 当前输入」实时比对决定，
     正常动线全部覆盖；保存改过梗概的旧草稿再载入的极端路径下，
     剧本与梗概的分镜页签同屏可见，用户过目的就是将拍的内容 */
  if (opts?.keepScript) {
    const beats = await db.storyBeat.findMany({
      where: { projectId: project.id },
      orderBy: { index: "asc" },
    });
    if (beats.length > 0) {
      await appendLog(
        runId,
        "screenwriter",
        "剧本已过稿定稿——沿用交稿剧本直接开机，编剧室本轮不重写（配置未变）"
      );
      return {
        summary: `沿用已过稿剧本：${beats.length} 场，编剧室本轮不重写`,
      };
    }
    // 项目无剧本可沿用：走常规生成路径（防御式回退，不 fail）
  }
  const provider = getTextProvider();
  const messages = buildScreenplayMessages({
    genreName: project.genreName,
    genreBadge: project.genreBadge,
    hookTactic: project.hookTactic,
    musicMood: project.musicMood,
    tonePrompt: project.tonePrompt,
    synopsis: project.synopsis,
    durationSeconds: project.durationSeconds,
    resolution: project.resolution,
    thinkingLevel: project.thinkingLevel as "low" | "medium" | "high",
    enhance: project.promptEnhance,
  });

  let beats: StoryBeat[] | null = null;
  let lastRaw = "";
  let lastFinishReason = "";
  for (
    let attempt = 0;
    attempt < SCREENPLAY_RETRY_HINTS.length && !beats;
    attempt++
  ) {
    // v2.9.13 心跳：编剧单次推演可达分钟级，30s 一条进行中文案防盲等
    const stopBeat = startHeartbeat(
      runId,
      "screenwriter",
      `编剧推演中${attempt > 0 ? `（第 ${attempt + 1} 轮补写）` : ""}`
    );
    try {
      const { text, finishReason } = await provider.complete({
        messages: [
          messages[0],
          {
            role: "user",
            content:
              attempt === 0
                ? messages[1].content
                : `${messages[1].content}\n\n${SCREENPLAY_RETRY_HINTS[attempt]}`,
          },
        ],
        thinking: { type: project.thinkingLevel === "low" ? "disabled" : "enabled" },
        onRetry: retryToLog(runId, "screenwriter", "编剧推演"),
      });
      lastRaw = text;
      lastFinishReason = finishReason ?? "";
      beats = parseScreenplayBeats(text);
    } finally {
      stopBeat();
    }
  }
  if (!beats) {
    // v2.9.11：人话给 UI，原始输出摘要（长度+首尾）落剧组日志供诊断；
    // finishReason=length 时直接定性「被截断」，不再让人猜
    const verdict =
      lastFinishReason === "length"
        ? "AI 返回内容被截断"
        : "AI 返回内容不完整或格式异常";
    throw new ParseFailError(
      `${verdict}（已连续重试仍无法解析）——点击「断点续拍」重新生成`,
      `原始输出 ${lastRaw.length} 字${
        lastFinishReason ? `（finish_reason=${lastFinishReason}）` : ""
      }，首 50 字：${lastRaw.slice(0, 50)}，尾 50 字：${lastRaw.slice(-50)}`
    );
  }
  await updateProject(project.id, { storyBeats: beats, status: "beatsReady" });
  return {
    summary: `场次剧本定稿：${beats.length} 场（${beats
      .map((b) => NARRATIVE_META[b.narrativeFunction].label)
      .join(" → ")}），运镜 ${beats.map((b) => b.cameraMovement).join(" / ")}`,
  };
}

// ============================================================
// 选角定妆阶段
// ============================================================

interface CastingAssetDraft {
  name: string;
  lockedAppearance: string;
  visualAnchor: string;
}

function buildCastingMessages(beats: DbBeat[], project: Project): string {
  const script = beats
    .map(
      (b) =>
        `【场 ${b.index} · ${b.actTitle}】\n画面：${b.description}\n金句：${b.dialogueSubtitle}\n提示：${b.promptGuidance}`
    )
    .join("\n\n");

  return `你是微短剧剧组的选角导演兼美术指导。任务：通读场次剧本，建立全剧资产库（角色 / 场景 / 道具），供后续所有镜头做「一致性锚定」——每个镜头的提示词都将引用这里的定妆描述，保证跨镜头不换脸、不穿帮。

【题材调性】${project.genreName}（${project.genreBadge}）；英文影调锚点：${project.tonePrompt}

${CASTING_FACE_RULE}

【场次剧本】
${script}

【要求（严格遵守）】
1. characters：主角、对手与关键配角，最多 6 个。lockedAppearance 为中文定妆描述（25~60 字：年龄、性别、身份气质、发型、脸型特征、服装、标志物）；visualAnchor 为对应英文串（15~30 words，如 "35-year-old Chinese male special forces captain, buzz cut, scar on left brow, black tactical vest"）
2. scenes：关键场景，最多 5 个。name 为短名（如「宴会厅」「冷宫」）；lockedAppearance 中文描述空间，并写明时段与内外景（如「夜·内，水晶吊灯暖光」）；visualAnchor 为英文，必须含时段与主光源（如 "luxury banquet hall at night, warm chandelier glow, interior"）——同场镜头光效一致性由此时段锚定保证，不得日夜跳变
3. props：推动剧情的关键道具，最多 4 个，没有则输出空数组
4. 名称必须与剧本用词一致，不得杜撰剧本中未出现的角色
5. visualAnchor 是所有镜头共用的视觉锚点，聚焦「跨镜头不变的外观特征」，不要写动作

【输出格式】只输出 JSON，禁止解释文字、禁止 markdown 围栏：
{"characters":[{"name":"…","lockedAppearance":"…","visualAnchor":"…"}],"scenes":[{"name":"…","lockedAppearance":"…","visualAnchor":"…"}],"props":[{"name":"…","lockedAppearance":"…","visualAnchor":"…"}]}`;
}

/**
 * 角色锚点 ethnicity 兜底校验（v2.4.1，docs §7.1 第 5 条防线二）：
 * 不信任 LLM 遵守选角铁律——落库前确定性地校验每个角色锚点是否含
 * ethnicity 关键词，缺失则追加兜底词。场景/道具不涉及面孔，不校验。
 */
function ensureCharacterEthnicity(drafts: CastingAssetDraft[]): CastingAssetDraft[] {
  return drafts.map((d) => {
    const hasEthnicity = ETHNICITY_KEYWORDS.some((kw) =>
      d.visualAnchor.toLowerCase().includes(kw)
    );
    if (hasEthnicity) return d;
    return {
      ...d,
      visualAnchor: `${d.visualAnchor}, ${ETHNICITY_FALLBACK}`,
    };
  });
}

function parseCasting(
  raw: string
): { characters: CastingAssetDraft[]; scenes: CastingAssetDraft[]; props: CastingAssetDraft[] } | null {
  const data = parseJsonLoose(raw) as Record<string, unknown> | null;
  if (!data) return null;

  const map = (v: unknown, max: number): CastingAssetDraft[] =>
    (Array.isArray(v) ? v : [])
      .map((item) => {
        const o = item as Record<string, unknown>;
        const name = typeof o?.name === "string" ? o.name.trim().slice(0, 20) : "";
        if (!name) return null;
        const lockedAppearance =
          typeof o?.lockedAppearance === "string" ? o.lockedAppearance.trim().slice(0, 200) : "";
        const visualAnchor =
          typeof o?.visualAnchor === "string" ? o.visualAnchor.trim().slice(0, 300) : "";
        if (!lockedAppearance && !visualAnchor) return null;
        return {
          name,
          lockedAppearance: lockedAppearance || "（定妆描述待补充）",
          visualAnchor: visualAnchor || lockedAppearance,
        } satisfies CastingAssetDraft;
      })
      .filter((x): x is CastingAssetDraft => !!x)
      .slice(0, max);

  const characters = ensureCharacterEthnicity(map(data.characters, 6));
  const scenes = map(data.scenes, 5);
  const props = map(data.props, 4);
  if (characters.length === 0 && scenes.length === 0) return null;
  return { characters, scenes, props };
}

async function stageCasting(
  runId: string,
  project: Project
): Promise<StageResult> {
  const beats = await db.storyBeat.findMany({
    where: { projectId: project.id },
    orderBy: { index: "asc" },
  });
  if (beats.length < 3) {
    throw new Error("场次剧本尚未就绪，请先完成编剧阶段");
  }

  const provider = getTextProvider();
  const prompt = buildCastingMessages(beats, project);
  let casting: ReturnType<typeof parseCasting> = null;
  let lastRaw = "";
  let lastFinishReason = "";
  for (
    let attempt = 0;
    attempt < CASTING_RETRY_HINTS.length && !casting;
    attempt++
  ) {
    const { text, finishReason } = await provider.complete({
      messages: [
        { role: "assistant", content: prompt },
        { role: "user", content: CASTING_RETRY_HINTS[attempt] },
      ],
      thinking: { type: "disabled" },
    });
    lastRaw = text;
    lastFinishReason = finishReason ?? "";
    casting = parseCasting(text);
  }
  if (!casting) {
    // v2.9.11：人话给 UI，原始输出摘要落剧组日志（同编剧阶段）
    const verdict =
      lastFinishReason === "length"
        ? "AI 返回内容被截断"
        : "AI 返回内容不完整或格式异常";
    throw new ParseFailError(
      `${verdict}（已连续重试仍无法解析）——点击「断点续拍」重新生成`,
      `原始输出 ${lastRaw.length} 字${
        lastFinishReason ? `（finish_reason=${lastFinishReason}）` : ""
      }，首 50 字：${lastRaw.slice(0, 50)}，尾 50 字：${lastRaw.slice(-50)}`
    );
  }

  // 幂等 upsert：同名资产更新锚点（保证与最新剧本一致）
  const kindGroups: Array<[AssetKind, CastingAssetDraft[]]> = [
    ["character", casting.characters],
    ["scene", casting.scenes],
    ["prop", casting.props],
  ];
  let count = 0;
  for (const [kind, drafts] of kindGroups) {
    for (const draft of drafts) {
      await db.asset.upsert({
        where: {
          projectId_kind_name: {
            projectId: project.id,
            kind,
            name: draft.name,
          },
        },
        create: {
          projectId: project.id,
          kind,
          name: draft.name,
          lockedAppearance: draft.lockedAppearance,
          visualAnchor: draft.visualAnchor,
          source: "crew",
        },
        update: {
          lockedAppearance: draft.lockedAppearance,
          visualAnchor: draft.visualAnchor,
        },
      });
      count++;
    }
  }
  await appendLog(
    runId,
    "casting",
    `资产入库：角色 ${casting.characters.length} · 场景 ${casting.scenes.length} · 道具 ${casting.props.length}`
  );
  return {
    summary: `资产库建立：${count} 项定妆锁定（角色 ${casting.characters.length} / 场景 ${casting.scenes.length} / 道具 ${casting.props.length}）`,
  };
}

// ============================================================
// 导演拆镜阶段
// ============================================================

async function stageDirecting(
  runId: string,
  project: Project
): Promise<StageResult> {
  const [beats, assets] = await Promise.all([
    db.storyBeat.findMany({
      where: { projectId: project.id },
      orderBy: { index: "asc" },
    }),
    db.asset.findMany({ where: { projectId: project.id } }),
  ]);
  if (beats.length < 3) {
    throw new Error("场次剧本尚未就绪，请先完成编剧阶段");
  }

  const roster = {
    characters: assets.filter((a) => a.kind === "character").map((a) => a.name),
    scenes: assets.filter((a) => a.kind === "scene").map((a) => a.name),
    props: assets.filter((a) => a.kind === "prop").map((a) => a.name),
  };

  let totalShots = 0;
  let skippedScenes = 0;
  let sceneOrder = 0; // v2.9.13 实际拆解计数（跳过的场不计入）
  for (const beat of beats) {
    // 成片保护：该场已有已生成镜头时跳过拆解（不覆盖劳动成果），
    // 由日志明确告知；如需重拍请先在镜头轨把该场镜头重置为待生成
    const hasReadyClip = await db.timelineClip.findFirst({
      where: { projectId: project.id, beatIndex: beat.index, status: "ready" },
      select: { id: true },
    });
    if (hasReadyClip) {
      skippedScenes++;
      await appendLog(
        runId,
        "director",
        `场 ${beat.index}（${beat.actTitle}）已有已生成镜头，跳过拆解以保护成片（重拍请先重置该场镜头）`
      );
      continue;
    }
    sceneOrder++;
    // v2.9.13 逐场开工日志（用户视角走查 P1）：拆镜阶段总耗时可达数分钟，
    // 只有「全场完成」日志的话用户看不到推进；开工+完成成对出现即是进度
    await appendLog(
      runId,
      "director",
      `开始拆解场 ${beat.index}（${beat.actTitle}）· ${beats.length} 场中的第 ${sceneOrder} 场`
    );
    // v2.9.13 心跳：单场拆镜 LLM 调用可达分钟级（限流退避更甚）
    const stopBeat = startHeartbeat(
      runId,
      "director",
      `导演拆解场 ${beat.index}（${beat.actTitle}）中`
    );
    let shots: ShotBreakdownItem[];
    try {
      shots = await breakdownAct({
        genreName: project.genreName,
        genreBadge: project.genreBadge,
        tonePrompt: project.tonePrompt,
        synopsis: project.synopsis,
        beats: beats.map((b) => ({
          index: b.index,
          actTitle: b.actTitle,
          narrativeFunction: b.narrativeFunction as StoryBeat["narrativeFunction"],
          pacingNote: b.pacingNote,
          description: b.description,
          dialogueSubtitle: b.dialogueSubtitle,
          cameraMovement: b.cameraMovement,
          promptGuidance: b.promptGuidance,
        })),
        targetIndex: beat.index,
        assetRoster: roster,
        onRetry: retryToLog(runId, "director", `场 ${beat.index} 拆镜`),
      });
    } finally {
      stopBeat();
    }
    const clips = await replaceActClips(project.id, beat.index, shots);
    await bindRefsFromShots(project.id, beat.index, shots, clips);
    await updateBeatEnergy(project.id, beat.index, {
      energyStart: shots[0]?.energy ?? null,
      energyEnd: shots[shots.length - 1]?.energy ?? null,
    });
    totalShots += shots.length;
    await appendLog(
      runId,
      "director",
      `场 ${beat.index}（${beat.actTitle}）拆解完成：${shots.length} 镜（${shots
        .map((s) => s.shotSize)
        .join("→")}，能量 ${shots[0]?.energy ?? "-"}→${shots[shots.length - 1]?.energy ?? "-"}）`
    );
  }
  return {
    summary: `全场次拆镜完成：共 ${totalShots} 个镜头，正反打景别交替已就位${
      skippedScenes > 0 ? `；${skippedScenes} 场含成片已跳过` : ""
    }`,
  };
}

/** 按名称把拆镜产物中的资产引用解析为 ShotRef（精确名 → 包含式回退） */
export async function bindRefsFromShots(
  projectId: string,
  beatIndex: number,
  shots: ShotBreakdownItem[],
  clips: Array<{ id: string; beatIndex: number; order: number }>
): Promise<number> {
  const assets = await db.asset.findMany({ where: { projectId } });
  const byKind = (kind: AssetKind) => assets.filter((a) => a.kind === kind);
  const resolve = (kind: AssetKind, name: string) => {
    if (!name) return null;
    const pool = byKind(kind);
    return (
      pool.find((a) => a.name === name) ??
      pool.find(
        (a) => a.name.includes(name) || name.includes(a.name)
      ) ??
      null
    );
  };

  const actClips = clips
    .filter((c) => c.beatIndex === beatIndex)
    .sort((a, b) => a.order - b.order);
  let bound = 0;
  for (let i = 0; i < actClips.length && i < shots.length; i++) {
    const shot = shots[i];
    const clip = actClips[i];
    const targets = new Set<string>();
    // 场记状态注记（v2.8.3）：导演拆镜产出的 characterStates 落到
    // ShotRef.stateNote（角色名 → 资产 id 对齐后写入），锚定时译为英文
    const stateByAssetId = new Map<string, string>();
    for (const name of shot.characters) {
      const asset = resolve("character", name);
      if (asset) {
        targets.add(asset.id);
        const state = shot.characterStates?.[name.trim()];
        if (state) stateByAssetId.set(asset.id, state);
      }
    }
    const scene = resolve("scene", shot.scene);
    if (scene) targets.add(scene.id);
    for (const name of shot.props) {
      const asset = resolve("prop", name);
      if (asset) targets.add(asset.id);
    }
    for (const assetId of targets) {
      await db.shotRef.upsert({
        where: { shotId_assetId: { shotId: clip.id, assetId } },
        create: {
          shotId: clip.id,
          assetId,
          stateNote: stateByAssetId.get(assetId) ?? null,
        },
        update: {},
      });
      bound++;
    }
  }
  return bound;
}

// ============================================================
// 场记锚定阶段
// ============================================================

export async function anchorProjectClips(
  projectId: string,
  onlyClipIds?: string[]
): Promise<{ anchored: number; skipped: number }> {
  const [project, clips, refs] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.timelineClip.findMany({
      where: { projectId, ...(onlyClipIds ? { id: { in: onlyClipIds } } : {}) },
      orderBy: { order: "asc" },
    }),
    db.shotRef.findMany({
      where: { shot: { projectId } },
      include: { asset: true },
    }),
  ]);
  if (!project) throw new RouteError("项目不存在或已被删除", 404);

  const refsByClip = new Map<string, typeof refs>();
  for (const r of refs) {
    const list = refsByClip.get(r.shotId) ?? [];
    list.push(r);
    refsByClip.set(r.shotId, list);
  }

  let anchored = 0;
  let skipped = 0;
  for (const clip of clips) {
    if (clip.promptVersion === "manual") {
      skipped++;
      continue;
    }
    const bound = refsByClip.get(clip.id) ?? [];
    const characters = bound
      .filter((r) => r.asset.kind === "character")
      .map((r) => ({
        name: r.asset.name,
        visualAnchor: r.asset.visualAnchor,
        stateNote: r.stateNote,
      }));
    const sceneRef = bound.find((r) => r.asset.kind === "scene");
    const props = bound
      .filter((r) => r.asset.kind === "prop")
      .map((r) => ({
        name: r.asset.name,
        visualAnchor: r.asset.visualAnchor,
        stateNote: r.stateNote,
      }));

    const { finalPrompt, fingerprint } = composeVideoPrompt({
      shot: {
        visualDesc: clip.visualDesc ?? clip.name,
        visualPrompt: clip.visualPrompt,
        cameraMovement: clip.cameraMovement,
        shotSize: clip.shotSize,
      },
      characters,
      scene: sceneRef
        ? {
            name: sceneRef.asset.name,
            visualAnchor: sceneRef.asset.visualAnchor,
            stateNote: sceneRef.stateNote,
          }
        : null,
      props,
      tonePrompt: project.tonePrompt,
      aspectRatio: project.aspectRatio,
      plannedMs: clip.plannedMs,
      resolution: project.resolution,
    });

    await db.timelineClip.update({
      where: { id: clip.id },
      data: { finalPrompt, promptVersion: fingerprint },
    });
    anchored++;
  }
  return { anchored, skipped };
}

async function stageAnchoring(
  _runId: string,
  project: Project
): Promise<StageResult> {
  const { anchored, skipped } = await anchorProjectClips(project.id);
  return {
    summary: `锚定组装完成：${anchored} 个镜头写入最终提示词与锚点指纹${
      skipped > 0 ? `（${skipped} 个为人工微调，已跳过）` : ""
    }`,
  };
}

// ============================================================
// 后期成包阶段
// ============================================================

async function stagePostproduction(
  _runId: string,
  project: Project
): Promise<StageResult> {
  const { rebuildTracks } = await import("./track-service");
  const tracks = await rebuildTracks(project.id);
  await db.project.update({
    where: { id: project.id },
    data: { status: "inProduction" },
  });

  // v2.4.1：缺定妆图的资产自动提交 portrait 任务（幂等去重），
  // 消除「开机成功后资产页签全是占位符」的交互断层（docs §1.4 阶段表第 5 行）
  const { createTask } = await import("./task-service");
  const missing = await db.asset.findMany({
    where: { projectId: project.id, portraitUrl: null },
    select: { id: true },
  });
  let submitted = 0;
  for (const a of missing) {
    try {
      await createTask(project.id, { kind: "portrait", assetId: a.id });
      submitted += 1;
    } catch {
      // 已有活跃同目标任务等场景：跳过，不阻断流水线
    }
  }

  const count = (kind: string) => tracks.filter((t) => t.kind === kind).length;
  return {
    summary: `轨道就绪：字幕 ${count("subtitle")} 段（成片烧录）· 音效 ${count("sfx")} 段（随制作包交付，由后期按拟音提示执行）· 配乐 ${count("bgm")} 段（成片混音+响度归一）；${submitted > 0 ? `定妆任务 ${submitted} 个已入队，定妆图将陆续出片；` : ""}情绪能量曲线与制作包就绪`,
  };
}

// ============================================================
// v2.9.18 上游风暴自动续拍（run 级自动重试）
// 走查实证：429 风暴期一次开机需手动点 4 轮「断点续拍」——流水线在
// 单调用级已有退避重试，但 run 失败后只能干等人手。剧组语义：导演组
// 不会因供电闪断就散场，会在合理耐心内自动重新开工，并把每一轮等待
// 与续拍都播报到剧组日志，无需人值守。
// 设计约束：
// - 只对瞬时类失败自动续拍（限流/5xx/网络/超时/截断/解析耗尽），
//   业务类失败（项目不存在/护栏拦截等）仍走人工；
// - 退避 45s/90s/180s，上限 3 轮，达上限明确告知停止原因；
// - 人工「断点续拍」随时可插队，且人工接手即重置耐心（再给 3 轮）；
// - 自动续拍前校验「本 run 仍是该项目最新 run」，防止旧 run 复活
//   与新开机打架；续拍被拒（running）静默让位；
// - 服务重启丢定时器：启动回收时把 error 里的自动续拍承诺改写并
//   落一条日志，绝不留「答应了却不来」的死承诺。
// ============================================================

const AUTO_RESUME_CAP = 3;
const AUTO_RESUME_DELAYS_MS = [45_000, 90_000, 180_000];
/** 瞬时类失败判据（与 humanize-error 模式表同源 + 解析三级重试耗尽） */
const TRANSIENT_FAILURE_RE =
  /429|rate.?limit|限流|status 5\d\d|internal server error|bad gateway|service unavailable|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|network|timed? ?out|aborted|被截断|truncat|空内容|连续重试仍无法解析/i;
/** 写入 run.error 的自动续拍承诺标记（重启回收时据此改写） */
const AUTO_RESUME_TAG_RE = /（\d+s 后自动续拍第 \d+\/\d+ 轮）/;

type AutoResumeState = { round: number; timer?: ReturnType<typeof setTimeout> };
// Next dev 多 worker 会重复求值本模块——状态挂 globalThis 共享（同进程内）
const autoG = globalThis as unknown as {
  __dramaAutoResume?: Map<string, AutoResumeState>;
};
const autoResumeMap: Map<string, AutoResumeState> =
  autoG.__dramaAutoResume ?? new Map();
autoG.__dramaAutoResume = autoResumeMap;

function clearAutoResume(runId: string): void {
  const state = autoResumeMap.get(runId);
  if (state?.timer) clearTimeout(state.timer);
  autoResumeMap.delete(runId);
}

/** v2.9.18.1 扫过期死承诺：failed 且 error 带自动续拍标记，且承诺时间
 *  已过 + 120s 宽限仍未兑现 → 改写 error 并落日志。
 *  实弹走查教训：Next dev 多 worker 各自求值本模块，定时器活在 A 进程时
 *  B 进程启动即扫会把在途承诺误报成「已取消」——随后 A 照常点火，
 *  剧组日志自相矛盾。宽限窗内在途承诺不动；真死的承诺由轮询路径的
 *  惰性清扫兜底（见 getLatestRun），最迟 ~1 分钟内收敛。 */
async function sweepStaleAutoResumePromises(): Promise<void> {
  const rows = await db.productionRun.findMany({
    where: {
      status: "failed",
      updatedAt: { gt: new Date(Date.now() - 3600_000) },
    },
    select: { id: true, error: true, updatedAt: true },
    take: 50,
  });
  for (const row of rows) {
    const errText = row.error ?? "";
    const m = errText.match(/（(\d+)s 后自动续拍第 \d+\/\d+ 轮）/);
    if (!m) continue;
    const promisedSec = Number(m[1]);
    const ageMs = Date.now() - row.updatedAt.getTime();
    if (ageMs < (promisedSec + 120) * 1000) continue; // 在途定时器可能即将兑现——不误伤
    await db.productionRun
      .update({
        where: { id: row.id },
        data: { error: errText.replace(AUTO_RESUME_TAG_RE, "") },
      })
      .catch(() => undefined);
    await appendLog(
      row.id,
      "producer",
      "自动续拍未如期执行（可能经历服务重启）——请手动「断点续拍」从断点继续（已完成阶段不会重复执行）"
    ).catch(() => undefined);
  }
}

/** run 失败后调用：瞬时类失败 → 播报 + 退避定时自动续拍（不超过上限） */
async function scheduleAutoResume(runId: string, rawMessage: string): Promise<void> {
  try {
    if (!TRANSIENT_FAILURE_RE.test(rawMessage)) return; // 业务类失败：人工判断优先
    const run = await loadRun(runId);
    if (run.status !== "failed") return; // 已被人工接手/复活

    const prev = autoResumeMap.get(runId);
    if (prev?.timer) clearTimeout(prev.timer);
    const round = (prev?.round ?? 0) + 1;

    if (round > AUTO_RESUME_CAP) {
      await appendLog(
        runId,
        "producer",
        `上游通道持续不稳——自动续拍已达 ${AUTO_RESUME_CAP} 轮上限，先停一停；稍后请手动「断点续拍」，或检查网络后再试`
      );
      return;
    }

    const delayMs = AUTO_RESUME_DELAYS_MS[Math.min(round - 1, AUTO_RESUME_DELAYS_MS.length - 1)];
    const sec = Math.round(delayMs / 1000);

    await appendLog(
      runId,
      "producer",
      `上游通道仍不稳定——${sec}s 后自动续拍（第 ${round}/${AUTO_RESUME_CAP} 轮），无需值守；期间也可随时手动「断点续拍」`
    );
    // run.error 追加承诺标记：阶段卡主面直接可见，不必翻日志
    await db.productionRun.update({
      where: { id: runId },
      data: {
        error: `${run.error ?? ""}（${sec}s 后自动续拍第 ${round}/${AUTO_RESUME_CAP} 轮）`,
      },
    });

    autoResumeMap.set(runId, {
      round,
      timer: setTimeout(async () => {
        try {
          const fresh = await db.productionRun.findUnique({ where: { id: runId } });
          if (!fresh || fresh.status !== "failed") return; // 人工已接手/已完成
          // 防旧 run 复活：该 run 必须仍是项目最新一次运行
          const latest = await db.productionRun.findFirst({
            where: { projectId: fresh.projectId },
            orderBy: { createdAt: "desc" },
          });
          if (latest && latest.id !== runId) {
            clearAutoResume(runId);
            return;
          }
          await retryRun(runId, { auto: true, round });
        } catch {
          // 续拍被拒（如恰好被人工置 running）——静默让位，不惊扰用户
        }
      }, delayMs),
    });
  } catch {
    // 自动续拍是尽力而为：调度失败不影响失败态本身（手动按钮仍在）
  }
}

// ============================================================
// 编排状态机
// ============================================================

const STAGE_FN: Record<
  StageKey,
  (
    runId: string,
    project: Project,
    opts?: { keepScript?: boolean }
  ) => Promise<StageResult>
> = {
  screenwriting: stageScreenwriting,
  casting: stageCasting,
  directing: stageDirecting,
  anchoring: stageAnchoring,
  postproduction: stagePostproduction,
};

async function executeRun(
  runId: string,
  opts: { keepScript?: boolean } = {}
): Promise<void> {
  try {
    const run = await db.productionRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== "running") return;

    for (const def of RUN_STAGES) {
      const current = await loadRun(runId);
      if (current.status !== "running") return; // 被外部取消/覆盖
      const stages = parseStages(current.stages);
      const stage = stages.find((s) => s.key === def.key);
      if (!stage || stage.status === "succeeded") continue;

      // —— 阶段置 running ——
      stage.status = "running";
      stage.startedAt = new Date().toISOString();
      stage.error = null;
      await patchStages(runId, stages);
      await db.productionRun.update({
        where: { id: runId },
        data: { stage: def.key },
      });
      const project = await db.project.findUnique({
        where: { id: current.projectId },
      });
      if (!project) throw new Error("项目不存在或已被删除");

      const startMsg =
        STAGE_START_MESSAGE[def.key] ?? `进入「${def.name}」阶段`;
      const modeLabel =
        def.key === "screenwriting" ? thinkingModeLabel(project.thinkingLevel) : "";
      await appendLog(
        runId,
        def.role,
        startMsg.replace("{mode}", modeLabel)
      );

      try {
        const result = await STAGE_FN[def.key](runId, project, opts);
        const fresh = parseStages((await loadRun(runId)).stages);
        const stageRow = fresh.find((s) => s.key === def.key);
        if (stageRow) {
          stageRow.status = "succeeded";
          stageRow.finishedAt = new Date().toISOString();
          await patchStages(runId, fresh);
        }
        await appendLog(runId, def.role, result.summary);
        await recomputeProgress(runId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "未知错误";
        // v2.9.13 错误人性化（用户视角走查 P0）：裸英文 429/5xx/网络错误
        // 直接甩给用户看不懂——三层（stages.error / run.error / journal）
        // 统一改为「人话标题 + 行动建议 + 技术详情括号」口径
        const friendly = stageFailureText(message);
        // 带 detail 的错误（如 BreakdownError）把模型原始输出片段落进剧组日志——
        // 否则「解析失败」永远无从诊断（v2.9.9）；run.error 保持干净给 UI
        const detail =
          typeof (err as { detail?: unknown }).detail === "string"
            ? (err as { detail: string }).detail
            : "";
        const fresh = parseStages((await loadRun(runId)).stages);
        const stageRow = fresh.find((s) => s.key === def.key);
        if (stageRow) {
          stageRow.status = "failed";
          stageRow.finishedAt = new Date().toISOString();
          stageRow.error = friendly;
          await patchStages(runId, fresh);
        }
        await db.productionRun.update({
          where: { id: runId },
          data: { status: "failed", error: `「${def.name}」阶段失败：${friendly}` },
        });
        await appendLog(
          runId,
          def.role,
          `阶段失败：${friendly}${
            detail ? `（模型原始输出片段：${detail.slice(0, 200)}）` : ""
          }`
        );
        // v2.9.18 瞬时类失败 → 排程自动续拍（剧组日志播报 + 阶段卡承诺标记）
        await scheduleAutoResume(runId, message);
        return;
      }
    }

    await db.productionRun.update({
      where: { id: runId },
      data: { status: "succeeded", progress: 100 },
    });
    // 杀青即清账：挂着的自动续拍计划作废（不应存在，防御性清理）
    clearAutoResume(runId);
    await appendLog(
      runId,
      "producer",
      "全片杀青 🎬 制作包已就绪：场次剧本 · 分镜表 · 资产定妆 · 镜头级提示词 · 三轨 · 能量曲线，可导出交付"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    await db.productionRun
      .update({
        where: { id: runId },
        // v2.9.13 外层兜底同样走人性化翻译（与阶段失败同口径）
        data: { status: "failed", error: stageFailureText(message) },
      })
      .catch(() => undefined);
    // v2.9.18 外层兜底失败同样参与自动续拍（多为网络/DB 瞬断）
    await scheduleAutoResume(runId, message);
  }
}

// ============================================================
// 对外 API
// ============================================================

export async function startRun(
  projectId: string,
  opts: { keepScript?: boolean } = {}
): Promise<RunDTO> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new RouteError("项目不存在或已被删除", 404);

  const running = await db.productionRun.findFirst({
    where: { projectId, status: "running" },
  });
  if (running) {
    throw new RouteError("该项目已有正在进行的流水线，请等待完成或稍后刷新", 409);
  }

  const run = await db.productionRun.create({
    data: {
      projectId,
      status: "running",
      progress: 0,
      stage: RUN_STAGES[0].key,
      stages: JSON.stringify(freshStages()),
      journal: JSON.stringify([
        {
          at: new Date().toISOString(),
          role: "producer",
          message: `项目《${project.title}》正式开机 🎬 题材战术手册已下发全组（${project.genreName} · ${project.genreBadge}）`,
        },
      ]),
    },
  });
  // 异步执行：路由立即返回，前端轮询 run 状态
  void executeRun(run.id, opts);
  return toRunDTO(run);
}

/** 断点续跑：已成功阶段保留，从首个未成功阶段继续
 *  v2.9.18 opts.auto：定时器自动续拍走此入口（日志口径区分自动/人工）；
 *  人工入口（API 路由）重置自动续拍耐心——人接手后重新给满 3 轮 */
export async function retryRun(
  runId: string,
  opts: { auto?: boolean; round?: number } = {}
): Promise<RunDTO> {
  const run = await loadRun(runId);
  if (run.status === "running") {
    throw new RouteError("流水线正在运行中，无需重试", 409);
  }
  if (!opts.auto) clearAutoResume(runId);
  const stages = parseStages(run.stages).map((s) =>
    s.status === "failed"
      ? { ...s, status: "pending", error: null, startedAt: null, finishedAt: null }
      : s
  );
  const resume = stages.find((s) => s.status !== "succeeded");
  await db.productionRun.update({
    where: { id: runId },
    data: {
      status: "running",
      error: null,
      stages: JSON.stringify(stages),
    },
  });
  await appendLog(
    runId,
    "producer",
    resume
      ? `${
          opts.auto
            ? `自动续拍（第 ${opts.round ?? "?"} 轮，无人值守）：从「${resume.name}」阶段继续（已完成阶段不重复执行）`
            : `断点续拍：从「${resume.name}」阶段继续（已完成阶段不重复执行）`
        }`
      : "复核完成，直接进入收尾"
  );
  void executeRun(runId);
  const fresh = await loadRun(runId);
  return toRunDTO(fresh);
}

export async function getRun(runId: string): Promise<RunDTO> {
  return toRunDTO(await loadRun(runId));
}

export async function getLatestRun(projectId: string): Promise<RunDTO | null> {
  // v2.9.18.1 惰性清扫兜底：模块加载时的清扫只在 worker 首次求值触发；
  // 若进程在宽限窗内死亡，承诺死后无人收敛——挂在观测轮询热路径上
  // 节流扫一次（每进程至多 60s 一次，扫描本身仅 SELECT 近 1h failed）
  const sweepG = globalThis as unknown as { __dramaAutoResumeSweptAt?: number };
  const now = Date.now();
  if (!sweepG.__dramaAutoResumeSweptAt || now - sweepG.__dramaAutoResumeSweptAt > 60_000) {
    sweepG.__dramaAutoResumeSweptAt = now;
    void sweepStaleAutoResumePromises().catch(() => undefined);
  }
  const row = await db.productionRun.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return row ? toRunDTO(row) : null;
}

export async function listRuns(projectId: string): Promise<RunDTO[]> {
  const rows = await db.productionRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return rows.map(toRunDTO);
}

// ============================================================
// 进程重启恢复：残留 running 的运行回置 failed（可断点重试）
// 注意：只回置「过期」的运行（updatedAt 落后回收窗口以上，见
// ORPHAN_RECOVERY_WINDOW_MS）。
// Next dev 按路由懒编译 + worker 隔离，本模块会被多次求值；
// 无差别回置会把正在执行的流水线误杀（生产多实例同理需要心跳判据）。
// ============================================================
const g = globalThis as unknown as { __dramaRunRecovered?: boolean };
if (!g.__dramaRunRecovered) {
  g.__dramaRunRecovered = true;
  void db.productionRun
    .updateMany({
      where: {
        status: "running",
        updatedAt: { lt: new Date(Date.now() - ORPHAN_RECOVERY_WINDOW_MS) },
      },
      data: {
        status: "failed",
        error: "服务重启导致流水线中断，可点击重试从断点继续",
      },
    })
    .catch(() => undefined);
  // v2.9.18 重启善后：自动续拍定时器随进程消失——error 里的
  // 「Xs 后自动续拍」承诺若已过期且未兑现，必须改写，不留答应了
  // 却不来的死承诺。v2.9.18.1：改用带宽限窗的清扫（在途定时器不误伤）
  void sweepStaleAutoResumePromises().catch(() => undefined);
}
