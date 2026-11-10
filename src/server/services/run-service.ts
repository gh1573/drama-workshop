import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import {
  ACT_MOVEMENT_POOLS,
  CAMERA_MOVEMENTS,
  NARRATIVE_META,
  RUN_STAGES,
  type AssetKind,
  type CrewRoleKey,
  type NarrativeFunction,
  type RunDTO,
  type RunLogEntry,
  type RunStageInfo,
  type ShotBreakdownItem,
  type StoryBeat,
} from "@/lib/drama";
import { getTextProvider, parseJsonLoose } from "@/server/providers";
import { composeVideoPrompt } from "@/server/engines/prompt-engine";
import { breakdownAct } from "./breakdown-service";
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
 * 制片立项 → 编剧三幕 → 选角定妆 → 导演拆镜 → 场记锚定 → 后期成包。
 * 普通用户不慬运镜/景别/轴线，也能拿到专业级制作包。
 *
 * 工程语义：
 * - 每个阶段幂等（断点重试从首个未成功阶段继续）；
 * - 阶段快照 + 剧组日志持久化，前端轮询即可获得完整生产观测；
 * - LLM 调用全部经 Provider 通道（解析级重试 2 次）。
 */

type StageKey = string;

interface StageResult {
  summary: string;
}

const STAGE_START_MESSAGE: Record<string, string> = {
  screenwriting: "领取任务：围绕黄金 3 秒钩子推演三幕剧本（节奏模式：{mode}）",
  casting: "通读剧本，提取角色 / 场景 / 道具，逐一完成定妆锁定",
  directing: "逐幕拆解分镜：正反打节奏、景别交替、运镜梯级调度",
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
// 编剧阶段（提示词自 v1 generate 路由迁移，质量约束不变）
// ============================================================

const PACING_FALLBACK: Record<NarrativeFunction, string> = {
  hook: "0~3s 强冲突切入！拒绝无效铺垫，拉满情绪张力",
  climax: "4~8s 顶级反转登场，局势瞬间颠覆",
  cliffhanger: "9~12s 意犹未尽，悬念卡点让观众欲罢不能",
};

function thinkingModeLabel(level: string): string {
  if (level === "high") return "伏笔回收";
  if (level === "medium") return "节奏铺垫";
  return "直给爆点";
}

function buildScreenwritingMessages(project: Project): {
  messages: Array<{ role: "assistant" | "user"; content: string }>;
} {
  const thinkingLevel = project.thinkingLevel;
  const enhance = project.promptEnhance;

  const levelDesc =
    thinkingLevel === "high"
      ? "伏笔回收模式：第一幕埋入一个不起眼的道具/细节伏笔，第三幕反转时回收该伏笔，制造双重反转"
      : thinkingLevel === "medium"
        ? "节奏铺垫模式：第一幕冲突前允许 1 拍情绪铺垫，随后立即爆点"
        : "直给爆点模式：第一幕 0 秒直接进入最强冲突，拒绝任何铺垫";

  const enhanceDesc = enhance
    ? "【提示词增强已开启】每幕的 promptGuidance 需在中文镜头提示末尾追加 2~3 个英文电影级关键词（如 cinematic lighting, slow motion, anamorphic flare, shallow depth of field），用逗号自然衔接，强化 AI 视频出片质量。"
    : "【提示词增强已关闭】promptGuidance 仅使用中文镜头提示。";

  const poolDesc = (fn: NarrativeFunction) =>
    ACT_MOVEMENT_POOLS[fn]
      .map((k) => `${k}=${CAMERA_MOVEMENTS[k].label}`)
      .join("、");

  const system = `你是一位顶级竖屏微短剧编剧兼分镜导演，精通 9:16 黄金三幕结构与 AI 视频提示词工程，作品以"3 秒抓人、8 秒反转、12 秒留钩"著称。

【任务】根据【题材预设】与【剧情梗概】，产出一支约 12 秒竖屏短剧的完整三幕分镜脚本，严格输出 JSON。

【三幕结构（必须严格遵守）】
- 第 1 幕 narrativeFunction=hook（0~3s 黄金开头）：actTitle 固定为「第一幕：极致冲突 (黄金开头 Hook)」
- 第 2 幕 narrativeFunction=climax（4~8s 绝地反转）：actTitle 固定为「第二幕：身份揭晓 (绝地反转 Clash)」
- 第 3 幕 narrativeFunction=cliffhanger（9~12s 卡点留钩）：actTitle 固定为「第三幕：致命悬念 (卡点留钩 Cliffhanger)」

【节奏策略（本次采用）】${levelDesc}

【三幕梯级运镜调度（视听导演硬约束）】
三幕必须呈现递进的视角层次，禁止同质化：
- 第 1 幕 hook（锁定/冲击类）：${poolDesc("hook")}
- 第 2 幕 climax（排场/压迫类）：${poolDesc("climax")}
- 第 3 幕 cliffhanger（炫技/悬念类）：${poolDesc("cliffhanger")}
每幕只能从本幕推荐池中选择 cameraMovement，且三幕之间不得重复。

【写作要求】
1. 情节画面 description：40~80 字，完全可视化——人物在做什么、穿着、环境、冲突焦点，禁止抽象抒情
2. 台词金句 dialogueSubtitle：该幕的"封神台词"，口语化、有记忆点，不超过 18 个字，用中文双引号包裹
3. 节奏要求 pacingNote：说明该幕时间区间（0~3s / 4~8s / 9~12s）与节奏策略
4. 画面提示补充 promptGuidance：包含构图方式、人物微表情、关键道具、光效氛围
5. 三幕必须形成完整因果链：冲突 → 反转 → 留钩，梗概中的所有关键元素都要用上
6. 紧扣题材的钩子策略与调性，台词金句要有该题材的"爽点/甜点/悬念点"
7. ${enhanceDesc}

【输出格式】只输出 JSON，禁止任何解释文字、禁止 markdown 代码块围栏：
{
  "storyBeats": [
    { "index": 1, "actTitle": "第一幕：极致冲突 (黄金开头 Hook)", "narrativeFunction": "hook", "pacingNote": "…", "description": "…", "dialogueSubtitle": "…", "cameraMovement": "push", "promptGuidance": "…" },
    { "index": 2, "narrativeFunction": "climax", "…": "…" },
    { "index": 3, "narrativeFunction": "cliffhanger", "…": "…" }
  ]
}`;

  const user = `【题材预设】
题材：${project.genreName}（${project.genreBadge}）
黄金3秒钩子策略：${project.hookTactic}
建议配乐音效：${project.musicMood}
英文影调锚点：${project.tonePrompt}

【剧情梗概】
${project.synopsis}

【模型配置】
单镜时长：${project.durationSeconds} 秒 | 分辨率：${project.resolution} | 剧本思考深度：${thinkingLevel} | 提示词增强：${enhance ? "开启" : "关闭"}

请基于以上信息生成三幕分镜 JSON。`;

  return { messages: [{ role: "assistant", content: system }, { role: "user", content: user }] };
}

function parseBeats(raw: string): StoryBeat[] | null {
  const data = parseJsonLoose(raw) as { storyBeats?: unknown[] } | null;
  const arr = data?.storyBeats;
  if (!Array.isArray(arr) || arr.length < 3) return null;

  const funcs: NarrativeFunction[] = ["hook", "climax", "cliffhanger"];
  const beats: StoryBeat[] = [];
  for (let i = 0; i < 3; i++) {
    const item = arr[i] as Record<string, unknown>;
    const fn = funcs.includes(item?.narrativeFunction as NarrativeFunction)
      ? (item.narrativeFunction as NarrativeFunction)
      : funcs[i];
    const meta = NARRATIVE_META[fn];
    const str = (v: unknown, fallback: string) =>
      typeof v === "string" && v.trim() ? v.trim() : fallback;
    const cam =
      typeof item?.cameraMovement === "string" &&
      item.cameraMovement in CAMERA_MOVEMENTS
        ? item.cameraMovement
        : "";
    beats.push({
      index: i + 1,
      actTitle: `${meta.actNo}：${meta.label} (${meta.tag})`,
      narrativeFunction: fn,
      pacingNote: str(item?.pacingNote, PACING_FALLBACK[fn]),
      description: str(item?.description, "（分镜内容生成异常，请重试）"),
      dialogueSubtitle: str(item?.dialogueSubtitle, "台词生成异常，请重试"),
      cameraMovement: cam,
      promptGuidance: str(item?.promptGuidance, "提示生成异常，请重试"),
      energyStart: null,
      energyEnd: null,
    });
  }
  // 运镜合规修复：池外 → 本幕池；三幕互斥 → 换池内备选
  const used = new Set<string>();
  for (const beat of beats) {
    const pool = ACT_MOVEMENT_POOLS[beat.narrativeFunction];
    let mv = beat.cameraMovement;
    if (!pool.includes(mv)) mv = pool[0];
    if (used.has(mv)) {
      const alt = pool.find((k) => !used.has(k));
      if (alt) mv = alt;
    }
    used.add(mv);
    beat.cameraMovement = mv;
  }
  return beats;
}

async function stageScreenwriting(
  runId: string,
  project: Project
): Promise<StageResult> {
  const provider = getTextProvider();
  const base = buildScreenwritingMessages(project);

  let beats: StoryBeat[] | null = null;
  let lastRaw = "";
  for (let attempt = 0; attempt < 2 && !beats; attempt++) {
    const { text } = await provider.complete({
      messages: [
        base.messages[0],
        {
          role: "user",
          content:
            attempt === 0
              ? base.messages[1].content
              : `${base.messages[1].content}\n\n注意：上一次输出无法解析。请严格只输出一个合法 JSON 对象（含 storyBeats 数组），不要任何其他文字。`,
        },
      ],
      thinking: { type: project.thinkingLevel === "low" ? "disabled" : "enabled" },
    });
    lastRaw = text;
    beats = parseBeats(text);
  }
  if (!beats) {
    throw new Error(`剧本解析失败（${lastRaw.slice(0, 120)}…）`);
  }
  await updateProject(project.id, { storyBeats: beats, status: "beatsReady" });
  return {
    summary: `三幕剧本定稿：${beats
      .map((b) => NARRATIVE_META[b.narrativeFunction].label)
      .join(" → ")}，运镜 ${beats.map((b) => b.cameraMovement).join(" / ")}`,
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
        `【第 ${b.index} 幕 · ${b.actTitle}】\n画面：${b.description}\n金句：${b.dialogueSubtitle}\n提示：${b.promptGuidance}`
    )
    .join("\n\n");

  return `你是微短剧剧组的选角导演兼美术指导。任务：通读三幕剧本，建立全剧资产库（角色 / 场景 / 道具），供后续所有镜头做「一致性锚定」——每个镜头的提示词都将引用这里的定妆描述，保证跨镜头不换脸、不穿帮。

【题材调性】${project.genreName}（${project.genreBadge}）；英文影调锚点：${project.tonePrompt}

【三幕剧本】
${script}

【要求（严格遵守）】
1. characters：主角、对手与关键配角，最多 6 个。lockedAppearance 为中文定妆描述（25~60 字：年龄、性别、身份气质、发型、脸型特征、服装、标志物）；visualAnchor 为对应英文串（15~30 words，如 "35-year-old Chinese male special forces captain, buzz cut, scar on left brow, black tactical vest"）
2. scenes：关键场景，最多 5 个。name 为短名（如「宴会厅」「冷宫」）；lockedAppearance 描述空间与光线；visualAnchor 为英文
3. props：推动剧情的关键道具，最多 4 个，没有则输出空数组
4. 名称必须与剧本用词一致，不得杜撰剧本中未出现的角色
5. visualAnchor 是所有镜头共用的视觉锚点，聚焦「跨镜头不变的外观特征」，不要写动作

【输出格式】只输出 JSON，禁止解释文字、禁止 markdown 围栏：
{"characters":[{"name":"…","lockedAppearance":"…","visualAnchor":"…"}],"scenes":[{"name":"…","lockedAppearance":"…","visualAnchor":"…"}],"props":[{"name":"…","lockedAppearance":"…","visualAnchor":"…"}]}`;
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

  const characters = map(data.characters, 6);
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
    throw new Error("剧本尚未就绪，请先完成编剧阶段");
  }

  const provider = getTextProvider();
  const prompt = buildCastingMessages(beats, project);
  let casting: ReturnType<typeof parseCasting> = null;
  let lastRaw = "";
  for (let attempt = 0; attempt < 2 && !casting; attempt++) {
    const { text } = await provider.complete({
      messages: [
        { role: "assistant", content: prompt },
        {
          role: "user",
          content:
            attempt === 0
              ? "请建立资产库并只输出 JSON。"
              : "上一次输出无法解析。请严格只输出一个合法 JSON 对象（characters/scenes/props 三个数组），不要任何其他文字。",
        },
      ],
      thinking: { type: "disabled" },
    });
    lastRaw = text;
    casting = parseCasting(text);
  }
  if (!casting) {
    throw new Error(`选角定妆解析失败（${lastRaw.slice(0, 120)}…）`);
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
    throw new Error("剧本尚未就绪，请先完成编剧阶段");
  }

  const roster = {
    characters: assets.filter((a) => a.kind === "character").map((a) => a.name),
    scenes: assets.filter((a) => a.kind === "scene").map((a) => a.name),
    props: assets.filter((a) => a.kind === "prop").map((a) => a.name),
  };

  let totalShots = 0;
  let skippedActs = 0;
  for (const beat of beats) {
    // 成片保护：该幕已有已生成镜头时跳过拆解（不覆盖劳动成果），
    // 由日志明确告知；如需重拍请先在镜头轨把该幕镜头重置为待生成
    const hasReadyClip = await db.timelineClip.findFirst({
      where: { projectId: project.id, beatIndex: beat.index, status: "ready" },
      select: { id: true },
    });
    if (hasReadyClip) {
      skippedActs++;
      await appendLog(
        runId,
        "director",
        `第 ${beat.index} 幕已有已生成镜头，跳过拆解以保护成片（重拍请先重置该幕镜头）`
      );
      continue;
    }
    const shots = await breakdownAct({
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
    });
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
      `第 ${beat.index} 幕拆解完成：${shots.length} 镜（${shots
        .map((s) => s.shotSize)
        .join("→")}，能量 ${shots[0]?.energy ?? "-"}→${shots[shots.length - 1]?.energy ?? "-"}）`
    );
  }
  return {
    summary: `三幕拆镜完成：共 ${totalShots} 个镜头，正反打景别交替已就位${
      skippedActs > 0 ? `；${skippedActs} 幕含成片已跳过` : ""
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
    for (const name of shot.characters) {
      const asset = resolve("character", name);
      if (asset) targets.add(asset.id);
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
        create: { shotId: clip.id, assetId },
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
        subtitle: clip.subtitle,
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
  const count = (kind: string) => tracks.filter((t) => t.kind === kind).length;
  return {
    summary: `三轨落轨：字幕 ${count("subtitle")} · 音效 ${count("sfx")} · 配乐 ${count("bgm")} 段；情绪能量曲线与制作包就绪`,
  };
}

// ============================================================
// 编排状态机
// ============================================================

const STAGE_FN: Record<
  StageKey,
  (runId: string, project: Project) => Promise<StageResult>
> = {
  screenwriting: stageScreenwriting,
  casting: stageCasting,
  directing: stageDirecting,
  anchoring: stageAnchoring,
  postproduction: stagePostproduction,
};

async function executeRun(runId: string): Promise<void> {
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
        const result = await STAGE_FN[def.key](runId, project);
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
        const fresh = parseStages((await loadRun(runId)).stages);
        const stageRow = fresh.find((s) => s.key === def.key);
        if (stageRow) {
          stageRow.status = "failed";
          stageRow.finishedAt = new Date().toISOString();
          stageRow.error = message;
          await patchStages(runId, fresh);
        }
        await db.productionRun.update({
          where: { id: runId },
          data: { status: "failed", error: `「${def.name}」阶段失败：${message}` },
        });
        await appendLog(runId, def.role, `阶段失败：${message}`);
        return;
      }
    }

    await db.productionRun.update({
      where: { id: runId },
      data: { status: "succeeded", progress: 100 },
    });
    await appendLog(
      runId,
      "producer",
      "全片杀青 🎬 制作包已就绪：三幕剧本 · 分镜表 · 资产定妆 · 镜头级提示词 · 三轨 · 能量曲线，可导出交付"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    await db.productionRun
      .update({
        where: { id: runId },
        data: { status: "failed", error: message },
      })
      .catch(() => undefined);
  }
}

// ============================================================
// 对外 API
// ============================================================

export async function startRun(projectId: string): Promise<RunDTO> {
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
  void executeRun(run.id);
  return toRunDTO(run);
}

/** 断点续跑：已成功阶段保留，从首个未成功阶段继续 */
export async function retryRun(runId: string): Promise<RunDTO> {
  const run = await loadRun(runId);
  if (run.status === "running") {
    throw new RouteError("流水线正在运行中，无需重试", 409);
  }
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
      ? `断点续拍：从「${resume.name}」阶段继续（已完成阶段不重复执行）`
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
// 注意：只回置「过期」的运行（updatedAt 落后 3 分钟以上）。
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
        updatedAt: { lt: new Date(Date.now() - 3 * 60_000) },
      },
      data: {
        status: "failed",
        error: "服务重启导致流水线中断，可点击重试从断点继续",
      },
    })
    .catch(() => undefined);
}
