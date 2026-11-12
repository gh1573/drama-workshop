import type { ShotBreakdownItem, StoryBeat } from "@/lib/drama";
import {
  ACT_MOVEMENT_POOLS,
  CAMERA_MOVEMENTS,
  SHOT_SIZES,
} from "@/lib/drama";
import { getTextProvider, parseJsonLoose } from "@/server/providers";
import { BREAKDOWN_SPEC } from "@/config/templates";

/**
 * 分镜拆解服务（导演阶段的执行单元）—— 把每场剧情拆成镜头组。
 *
 * 拆镜档位（每场镜头数 / 单镜时长 / 整集目标时长）由配置驱动
 * （src/config/templates.ts · BREAKDOWN_SPEC），当前为 60 秒集档位。
 *
 * v2 协议升级（对齐 docs/architecture-v2.md §7.6 / §4 C2 C3 C9）：
 * - 每镜头新增：energy（情绪能量 0~100）/ sfxHint（音效卡点）/
 *   characters / scene / props（资产引用，选角阶段按名称对齐资产库）/
 *   visualPrompt（英文动作提示词，锚定组装的动作段来源）；
 * - 持久化由 project-service.replaceActClips 完成。
 */

export interface BreakdownContext {
  genreName: string;
  genreBadge: string;
  tonePrompt: string;
  synopsis: string;
  beats: StoryBeat[];
  targetIndex: number;
  /** 资产库名单（选角阶段产物；为空时提示词退化为无引用模式） */
  assetRoster?: {
    characters: string[];
    scenes: string[];
    props: string[];
  };
}

function clampInt(v: unknown, min: number, max: number, fb: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function strArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 30))
    .slice(0, max);
}

/** characterStates 容错解析（v2.8.3 场记自动化）：只接受字符串→字符串，
 *  键值各截断 30/20 字，非法形态整体丢弃（不影响镜头成立） */
function parseCharacterStates(
  v: unknown
): Record<string, string> | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val !== "string" || !val.trim()) continue;
    out[k.trim().slice(0, 30)] = val.trim().slice(0, 20);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildBreakdownPrompt(ctx: BreakdownContext): string {
  const target = ctx.beats.find((b) => b.index === ctx.targetIndex);
  if (!target) throw new Error(`第 ${ctx.targetIndex} 场不存在`);
  const neighbors = ctx.beats
    .filter((b) => b.index !== ctx.targetIndex)
    .map(
      (b) =>
        `场 ${b.index}（${b.actTitle}）：${b.description} | 金句：${b.dialogueSubtitle}`
    )
    .join("\n");

  const pool = ACT_MOVEMENT_POOLS[target.narrativeFunction];
  const poolDesc = pool.map((k) => `${k}=${CAMERA_MOVEMENTS[k].label}`).join("、");

  const roster = ctx.assetRoster;
  const rosterSection = roster
    ? `【资产库名单（镜头引用必须使用这些确切名称）】
角色：${roster.characters.join("、") || "（无）"}
场景：${roster.scenes.join("、") || "（无）"}
道具：${roster.props.join("、") || "（无）"}`
    : "【资产库】尚未建库，characters/scene/props 输出空数组或空字符串即可。";

  return `你是一位竖屏微短剧的资深分镜师（Shot List Writer），服务于真实短剧承制团队。你的任务是把单场剧情拆解为一组连续镜头，形成可执行拍摄的分镜脚本。本集为约 ${BREAKDOWN_SPEC.targetEpisodeSeconds} 秒的竖屏微短剧，全场次合计镜头节奏需支撑整集时长。

【全剧梗概】
${ctx.synopsis}

【题材调性】${ctx.genreName}（${ctx.genreBadge}）；英文影调锚点：${ctx.tonePrompt}

【其他场次内容（保持因果衔接，不要改写）】
${neighbors}

【本次要拆解的一场】
${target.actTitle}
节奏要求：${target.pacingNote}
场次画面：${target.description}
场次金句（必须完整保留在其中最关键的 1 个镜头字幕里）：${target.dialogueSubtitle}
画面提示：${target.promptGuidance}

${rosterSection}

【拆解规则（严格遵守）】
1. 输出 ${BREAKDOWN_SPEC.shotsPerActMin}~${BREAKDOWN_SPEC.shotsPerActMax} 个镜头，每个镜头 ${Math.round(BREAKDOWN_SPEC.shotMsMin / 100) / 10}~${Math.round(BREAKDOWN_SPEC.shotMsMax / 100) / 10} 秒（plannedMs ${BREAKDOWN_SPEC.shotMsMin}~${BREAKDOWN_SPEC.shotMsMax}），支撑整集约 ${BREAKDOWN_SPEC.targetEpisodeSeconds} 秒的节奏
2. 景别 shotSize 只能从：${SHOT_SIZES.join("/")} 中选择，相邻镜头景别必须不同（正反打优先：A 特写 → B 大特写 → 全景反应 → 主角近景）；剪点优先「动接动」——切在动作进行中（伸手/转身/掷物瞬间），避免静态跳切堆叠
3. 运镜 cameraMovement 只能从本场推荐池中选择：${poolDesc}；同一场内尽量不重复。所有运镜为有意图的调度（轨道推拉/摇臂升降/稳定器环绕；手持仅限受控手持，幅度轻微）；对话正反打遵守 180° 轴线规则不得跳轴；visualPrompt 不写抖动/糊甩类描述
4. visualDesc：25~60 字中文，完全可视化（人物、动作、表情、环境、光效），禁止抽象抒情；光效必须与本场时段（日/夜）及主光源方向一致，同一场内不得日夜跳变、光源无端转向
5. visualPrompt：与 visualDesc 同义的英文动作描述（15~25 words，供 AI 视频基模直接使用）
6. subtitle：该镜头画面内字幕；普通镜头可为空字符串 ""，全场金句只出现 1 次
7. name：8 字以内的镜头标题，如「宴会厅 · 众人震惊」「黑卡 · 道具特写」
8. energy：该镜头的情绪能量 0~100 整数，场内必须逐镜递进（情绪推向场尾顶点）
9. sfxHint：8 字以内的中文音效提示，如「重低音入」「剑鸣破空」「玻璃碎裂」
10. characters：本镜头出场角色名数组（必须取自资产库名单）；scene：本镜头场景名（取自资产库名单，无则空字符串）；props：关键道具名数组
11. characterStates：本镜头内角色可变状态注记（场记单），仅在剧情发生状态变化时输出（如 {"陈锋":"负伤"}）；状态词优先用：负伤/血迹/湿身/泪痕/疲惫/狼狈/换军装/换官服/换西装/换礼服/换囚服/换嫁衣等短词（供确定性翻译），无变化则省略字段
12. 情绪必须递进：从该场的开场状态推向场尾状态

【输出格式】只输出 JSON，禁止解释文字、禁止 markdown 围栏：
{"shots":[{"name":"…","shotSize":"特写","cameraMovement":"push","visualDesc":"…","visualPrompt":"…","subtitle":"…","plannedMs":${Math.round((BREAKDOWN_SPEC.shotMsMin + BREAKDOWN_SPEC.shotMsMax) / 2)},"energy":62,"sfxHint":"…","characters":["…"],"scene":"…","props":["…"],"characterStates":{"…":"…"}}]}`;
}

function parseShots(raw: string): ShotBreakdownItem[] | null {
  const data = parseJsonLoose(raw) as { shots?: unknown[] } | null;
  const arr = data?.shots;
  if (!Array.isArray(arr) || arr.length < 2) return null;

  const shots: ShotBreakdownItem[] = [];
  for (const item of arr.slice(0, BREAKDOWN_SPEC.shotsPerActMax)) {
    const o = item as Record<string, unknown>;
    const str = (v: unknown, fb = "") =>
      typeof v === "string" && v.trim() ? v.trim() : fb;
    const mvRaw = str(o.cameraMovement);
    const mv = mvRaw in CAMERA_MOVEMENTS ? mvRaw : "";
    const sizeRaw = str(o.shotSize);
    const size = SHOT_SIZES.includes(sizeRaw as never) ? sizeRaw : "中景";
    const ms = Number(o.plannedMs);
    shots.push({
      name: str(o.name, "分镜镜头").slice(0, 40),
      shotSize: size,
      cameraMovement: mv || "push",
      visualDesc: str(o.visualDesc, "（镜头内容生成异常，请重试）"),
      visualPrompt: str(o.visualPrompt) || null,
      subtitle: str(o.subtitle).slice(0, 120),
      plannedMs: Number.isFinite(ms)
        ? Math.min(BREAKDOWN_SPEC.shotMsMax, Math.max(BREAKDOWN_SPEC.shotMsMin, Math.round(ms)))
        : Math.round((BREAKDOWN_SPEC.shotMsMin + BREAKDOWN_SPEC.shotMsMax) / 2),
      energy: clampInt(o.energy, 0, 100, 60),
      sfxHint: str(o.sfxHint).slice(0, 12),
      characters: strArray(o.characters, 4),
      scene: str(o.scene).slice(0, 30),
      props: strArray(o.props, 3),
      characterStates: parseCharacterStates(o.characterStates),
    });
  }
  if (shots.length < 2) return null;
  return shots;
}

/** 调用文本通道拆解一场（带 2 次解析级重试），返回结构化镜头组 */
export async function breakdownAct(
  ctx: BreakdownContext
): Promise<ShotBreakdownItem[]> {
  const prompt = buildBreakdownPrompt(ctx);
  const provider = getTextProvider();

  let shots: ShotBreakdownItem[] | null = null;
  let lastRaw = "";
  for (let attempt = 0; attempt < 2 && !shots; attempt++) {
    const { text } = await provider.complete({
      messages: [
        { role: "assistant", content: prompt },
        {
          role: "user",
          content:
            attempt === 0
              ? "请拆解并只输出 JSON。"
              : "上一次输出无法解析。请严格只输出一个合法 JSON 对象（含 shots 数组），不要任何其他文字。",
        },
      ],
      thinking: { type: "disabled" },
    });
    lastRaw = text;
    shots = parseShots(text);
  }
  if (!shots) {
    throw new BreakdownError(
      "AI 分镜拆解结果解析失败，请重试",
      lastRaw.slice(0, 300)
    );
  }

  // 场次运镜池归位：池外值回退到该场推荐池的轮转位
  const target = ctx.beats.find((b) => b.index === ctx.targetIndex);
  if (target) {
    const pool = ACT_MOVEMENT_POOLS[target.narrativeFunction];
    const seen = new Set<string>();
    shots = shots.map((s, i) => {
      let mv = s.cameraMovement;
      if (!pool.includes(mv)) mv = pool[i % pool.length];
      if (seen.has(mv)) {
        const alt = pool.find((k) => !seen.has(k));
        if (alt) mv = alt;
      }
      seen.add(mv);
      return { ...s, cameraMovement: mv };
    });
  }
  return shots;
}

export class BreakdownError extends Error {
  detail: string;
  constructor(message: string, detail = "") {
    super(message);
    this.detail = detail;
  }
}
