import {
  ACT_MOVEMENT_POOLS,
  CAMERA_MOVEMENTS,
  NARRATIVE_META,
  type NarrativeFunction,
  type StoryBeat,
} from "@/lib/drama";
import { BREAKDOWN_SPEC } from "@/config/templates";
import { parseJsonLoose } from "@/server/providers";

/**
 * 编剧阶段单一提示词源（v2.7「场次化剧本」）。
 *
 * 背景：v1.5 的固定「三幕节拍」（hook 0~3s / clash 4~8s / cliffhanger 9~12s，
 * 恰好 3 幕、标题写死）已被否决——真实微短剧工业按「场次 × 镜头」两级颗粒度
 * 组织剧本，且整集时长由拆镜档位（BREAKDOWN_SPEC.targetEpisodeSeconds）决定，
 * 与旧提示词里写死的「约 12 秒」互相矛盾。
 *
 * v2.7 契约（run-service 与 /api/generate 共用本模块，禁止再各自拼提示词）：
 * - 场次数弹性 3~6 场，由编剧按梗概信息量与反转密度自定；
 * - 首场 hook、末场 cliffhanger 是仅有的两条硬性要求（黄金 3 秒 + 连载钩子）；
 * - 中段功能从 buildup / twist / climax 中选用，相邻场次功能与运镜均不得重复；
 * - actTitle 为编剧自拟场次标题（4~8 字），不再套「第 N 幕：固定标签」模板。
 */

/** 场次数弹性范围（与 validators.ts storyBeats 校验保持一致） */
export const SCENE_COUNT_MIN = 3;
export const SCENE_COUNT_MAX = 6;

/** 编剧入参（流水线 Project 行与快速推演路由归一为同一形状） */
export interface ScreenplaySpec {
  genreName: string;
  genreBadge: string;
  hookTactic: string;
  musicMood: string;
  tonePrompt: string;
  synopsis: string;
  /** 单镜时长（模型配置，秒） */
  durationSeconds: number;
  resolution: string;
  thinkingLevel: "low" | "medium" | "high";
  enhance: boolean;
}

const PACING_FALLBACK: Record<NarrativeFunction, string> = {
  hook: "强冲突切入！拒绝无效铺垫，3 秒内拉满情绪张力",
  buildup: "冲突逐层加码，压迫感持续上行",
  twist: "身份反转登场，局势瞬间颠覆",
  climax: "情绪顶点引爆，爽感拉满",
  cliffhanger: "意犹未尽，悬念卡点让观众欲罢不能",
};

function thinkingLevelDesc(level: ScreenplaySpec["thinkingLevel"]): string {
  switch (level) {
    case "high":
      return "伏笔回收模式：首场埋入一个不起眼的道具/细节伏笔，末场反转时回收该伏笔，制造双重反转";
    case "medium":
      return "节奏铺垫模式：首场冲突前允许 1 拍情绪铺垫，随后立即爆点";
    default:
      return "直给爆点模式：首场 0 秒直接进入最强冲突，拒绝任何铺垫";
  }
}

const poolDesc = (fn: NarrativeFunction) =>
  ACT_MOVEMENT_POOLS[fn]
    .map((k) => `${k}=${CAMERA_MOVEMENTS[k].label}`)
    .join("、");

export function buildScreenplayMessages(
  spec: ScreenplaySpec
): Array<{ role: "assistant" | "user"; content: string }> {
  const levelDesc = thinkingLevelDesc(spec.thinkingLevel);
  const enhanceDesc = spec.enhance
    ? "【提示词增强已开启】每场的 promptGuidance 需在中文镜头提示末尾追加 2~3 个英文电影级关键词（如 cinematic lighting, slow motion, anamorphic flare, shallow depth of field），用逗号自然衔接，强化 AI 视频出片质量。"
    : "【提示词增强已关闭】promptGuidance 仅使用中文镜头提示。";

  const system = `你是一位顶级竖屏微短剧编剧兼分镜导演，精通 9:16 场次化剧本结构与 AI 视频提示词工程，作品以"3 秒抓人、中场反转、收尾留钩"著称。

【任务】根据【题材预设】与【剧情梗概】，为一集约 ${BREAKDOWN_SPEC.targetEpisodeSeconds} 秒的竖屏短剧推演完整场次剧本，严格输出 JSON。

【场次结构（编剧自定，服务故事，禁止套用固定三幕模板）】
- 场次数 ${SCENE_COUNT_MIN}~${SCENE_COUNT_MAX} 场：由梗概的信息量与反转密度决定，单场约 8~20 秒
- 第 1 场 narrativeFunction=hook（黄金 3 秒钩子开场，硬性要求）
- 末场 narrativeFunction=cliffhanger（卡点留钩，逼观众追下一集，硬性要求）
- 中间场次从 buildup（冲突升级）/ twist（身份反转）/ climax（情绪顶点）中按剧情选用，相邻场次功能不得重复
- 每场 pacingNote 写明起止秒（如「0~12s」），全场次连续切分、覆盖约 ${BREAKDOWN_SPEC.targetEpisodeSeconds} 秒整集时长
- actTitle 为编剧自拟的场次标题（4~8 字，如「婚书碎地」「统帅破门」），不要写幕号

【节奏策略（本次采用）】${levelDesc}

【场次运镜调度（视听导演硬约束）】
相邻场次必须呈现递进的视角层次，禁止同质化：
- hook（锁定/冲击类）：${poolDesc("hook")}
- buildup（跟拍/压迫类）：${poolDesc("buildup")}
- twist（揭示/颠覆类）：${poolDesc("twist")}
- climax（排场/压迫类）：${poolDesc("climax")}
- cliffhanger（炫技/悬念类）：${poolDesc("cliffhanger")}
每场只能从本功能推荐池中选择 cameraMovement，且相邻场次之间不得重复。
【运镜稳定硬约束】所有机位一律按稳定器（gimbal/steadicam）平顺执行，画面必须平稳；promptGuidance 禁止出现手持晃动、镜头抖动、模糊甩动类描述。

【写作要求】
1. 情节画面 description：40~80 字，完全可视化——人物在做什么、穿着、环境、冲突焦点，禁止抽象抒情
2. 台词金句 dialogueSubtitle：该场的"封神台词"，口语化、有记忆点，不超过 18 个字，用中文双引号包裹
3. 节奏要求 pacingNote：说明该场时间区间与节奏策略
4. 画面提示补充 promptGuidance：包含构图方式、人物微表情、关键道具、光效氛围
5. 全场次必须形成完整因果链：钩子 → 升级 → 反转/顶点 → 留钩，梗概中的所有关键元素都要用上
6. 紧扣题材的钩子策略与调性，台词金句要有该题材的"爽点/甜点/悬念点"
7. ${enhanceDesc}

【输出格式】只输出 JSON，禁止任何解释文字、禁止 markdown 代码块围栏：
{
  "storyBeats": [
    { "index": 1, "actTitle": "婚书碎地", "narrativeFunction": "hook", "pacingNote": "0~12s …", "description": "…", "dialogueSubtitle": "…", "cameraMovement": "push", "promptGuidance": "…" },
    { "index": 2, "actTitle": "…", "narrativeFunction": "buildup", "…": "…" }
  ]
}`;

  const user = `【题材预设】
题材：${spec.genreName}（${spec.genreBadge}）
黄金3秒钩子策略：${spec.hookTactic}
建议配乐音效：${spec.musicMood}
英文影调锚点：${spec.tonePrompt}

【剧情梗概】
${spec.synopsis}

【模型配置】
单镜时长：${spec.durationSeconds} 秒 | 分辨率：${spec.resolution} | 剧本思考深度：${spec.thinkingLevel} | 提示词增强：${spec.enhance ? "开启" : "关闭"}

请基于以上信息生成场次剧本 JSON（storyBeats 数组 ${SCENE_COUNT_MIN}~${SCENE_COUNT_MAX} 个场次，首场 hook、末场 cliffhanger）。`;

  return [
    { role: "assistant", content: system },
    { role: "user", content: user },
  ];
}

/** 中段功能缺省梯子（LLM 未给/给错时按位置轮换，保证相邻不重复） */
const MIDDLE_FN_LADDER: NarrativeFunction[] = ["buildup", "twist", "climax"];

/** 剥掉 LLM 可能残留的「第 N 幕：」前缀与首尾引号 */
function sanitizeTitle(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .trim()
    .replace(/^第[一二三四五六七八九十\d]+\s*幕\s*[：:—-]?\s*/, "")
    .replace(/^[「『"“]|[」』"”]$/g, "")
    .trim();
}

/**
 * 解析并规范化场次剧本（run-service 与 /api/generate 共用）：
 * - 场次数不足 3 或超过 6 时截断/判废；
 * - 首场强制 hook、末场强制 cliffhanger（契约硬性要求，不信任 LLM）；
 * - actTitle 清洗幕号前缀；缺失时回退「功能 + 序号」命名；
 * - 运镜合规修复：池外 → 本功能推荐池；与上一场重复 → 换池内备选。
 */
export function parseScreenplayBeats(raw: string): StoryBeat[] | null {
  const data = parseJsonLoose(raw) as { storyBeats?: unknown[] } | null;
  const arr = data?.storyBeats;
  if (!Array.isArray(arr) || arr.length < SCENE_COUNT_MIN) return null;

  const validFns = Object.keys(NARRATIVE_META) as NarrativeFunction[];
  const taken = arr.slice(0, SCENE_COUNT_MAX);
  const beats: StoryBeat[] = [];

  taken.forEach((entry, i) => {
    const item = entry as Record<string, unknown>;
    const isFirst = i === 0;
    const isLast = i === taken.length - 1;

    let fn: NarrativeFunction;
    const rawFn = item?.narrativeFunction;
    if (validFns.includes(rawFn as NarrativeFunction)) {
      fn = rawFn as NarrativeFunction;
    } else if (isFirst) {
      fn = "hook";
    } else if (isLast) {
      fn = "cliffhanger";
    } else {
      fn = MIDDLE_FN_LADDER[(i - 1) % MIDDLE_FN_LADDER.length];
    }
    // 契约硬性要求：首场 hook、末场 cliffhanger（即便 LLM 标了别的也归位）
    if (isFirst) fn = "hook";
    if (isLast && taken.length >= SCENE_COUNT_MIN) fn = "cliffhanger";

    const meta = NARRATIVE_META[fn];
    const str = (v: unknown, fallback: string) =>
      (typeof v === "string" && v.trim() ? v.trim() : fallback);
    const title =
      sanitizeTitle(item?.actTitle) || `场景${i + 1} · ${meta.label}`;

    const cam =
      typeof item?.cameraMovement === "string" &&
      item.cameraMovement in CAMERA_MOVEMENTS
        ? item.cameraMovement
        : "";

    const secPer = Math.round(
      BREAKDOWN_SPEC.targetEpisodeSeconds / taken.length
    );
    const range = `${i * secPer}~${(i + 1) * secPer}s`;

    beats.push({
      index: i + 1,
      actTitle: title,
      narrativeFunction: fn,
      pacingNote: str(item?.pacingNote, `${range}，${PACING_FALLBACK[fn]}`),
      description: str(item?.description, "（分镜内容生成异常，请重试）"),
      dialogueSubtitle: str(item?.dialogueSubtitle, "台词生成异常，请重试"),
      cameraMovement: cam,
      promptGuidance: str(item?.promptGuidance, "提示生成异常，请重试"),
      energyStart: null,
      energyEnd: null,
    });
  });

  // 运镜合规修复：池外 → 本功能推荐池；与上一场重复 → 换池内备选
  let prevMv = "";
  for (const beat of beats) {
    const pool = ACT_MOVEMENT_POOLS[beat.narrativeFunction];
    let mv = beat.cameraMovement;
    if (!pool.includes(mv)) mv = pool[0];
    if (mv === prevMv || !mv) {
      const alt = pool.find((k) => k !== prevMv);
      if (alt) mv = alt;
    }
    beat.cameraMovement = mv;
    prevMv = mv;
  }
  return beats;
}
