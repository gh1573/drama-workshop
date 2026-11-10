import type { ShotBreakdownItem, StoryBeat } from "@/lib/drama";
import {
  ACT_MOVEMENT_POOLS,
  CAMERA_MOVEMENTS,
  SHOT_SIZES,
} from "@/lib/drama";
import { getTextProvider, parseJsonLoose } from "@/server/providers";
import { BREAKDOWN_SPEC } from "@/config/templates";

/**
 * 分镜拆解服务（导演阶段的执行单元）—— 把每幕剧情拆成镜头组。
 *
 * 拆镜档位（每幕镜头数 / 单镜时长 / 整集目标时长）由配置驱动
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

function buildBreakdownPrompt(ctx: BreakdownContext): string {
  const target = ctx.beats.find((b) => b.index === ctx.targetIndex);
  if (!target) throw new Error(`第 ${ctx.targetIndex} 幕不存在`);
  const neighbors = ctx.beats
    .filter((b) => b.index !== ctx.targetIndex)
    .map(
      (b) =>
        `第 ${b.index} 幕（${b.actTitle}）：${b.description} | 金句：${b.dialogueSubtitle}`
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

  return `你是一位竖屏微短剧的资深分镜师（Shot List Writer），服务于真实短剧承制团队。你的任务是把单幕剧情拆解为一组连续镜头，形成可执行拍摄的分镜脚本。本集为约 ${BREAKDOWN_SPEC.targetEpisodeSeconds} 秒的竖屏微短剧，三幕合计镜头节奏需支撑整集时长。

【全剧梗概】
${ctx.synopsis}

【题材调性】${ctx.genreName}（${ctx.genreBadge}）；英文影调锚点：${ctx.tonePrompt}

【其他幕内容（保持因果衔接，不要改写）】
${neighbors}

【本次要拆解的一幕】
${target.actTitle}
节奏要求：${target.pacingNote}
幕级画面：${target.description}
幕级金句（必须完整保留在其中最关键的 1 个镜头字幕里）：${target.dialogueSubtitle}
画面提示：${target.promptGuidance}

${rosterSection}

【拆解规则（严格遵守）】
1. 输出 ${BREAKDOWN_SPEC.shotsPerActMin}~${BREAKDOWN_SPEC.shotsPerActMax} 个镜头，每个镜头 ${Math.round(BREAKDOWN_SPEC.shotMsMin / 100) / 10}~${Math.round(BREAKDOWN_SPEC.shotMsMax / 100) / 10} 秒（plannedMs ${BREAKDOWN_SPEC.shotMsMin}~${BREAKDOWN_SPEC.shotMsMax}），支撑整集约 ${BREAKDOWN_SPEC.targetEpisodeSeconds} 秒的节奏
2. 景别 shotSize 只能从：${SHOT_SIZES.join("/")} 中选择，相邻镜头景别必须不同（正反打优先：A 特写 → B 大特写 → 全景反应 → 主角近景）
3. 运镜 cameraMovement 只能从本幕推荐池中选择：${poolDesc}；同一幕内尽量不重复
4. visualDesc：25~60 字中文，完全可视化（人物、动作、表情、环境、光效），禁止抽象抒情
5. visualPrompt：与 visualDesc 同义的英文动作描述（15~25 words，供 AI 视频基模直接使用）
6. subtitle：该镜头画面内字幕；普通镜头可为空字符串 ""，全幕金句只出现 1 次
7. name：8 字以内的镜头标题，如「宴会厅 · 众人震惊」「黑卡 · 道具特写」
8. energy：该镜头的情绪能量 0~100 整数，幕内必须逐镜递进（情绪推向幕尾顶点）
9. sfxHint：8 字以内的中文音效提示，如「重低音入」「剑鸣破空」「玻璃碎裂」
10. characters：本镜头出场角色名数组（必须取自资产库名单）；scene：本镜头场景名（取自资产库名单，无则空字符串）；props：关键道具名数组
11. 情绪必须递进：从该幕的开场状态推向幕尾状态

【输出格式】只输出 JSON，禁止解释文字、禁止 markdown 围栏：
{"shots":[{"name":"…","shotSize":"特写","cameraMovement":"push","visualDesc":"…","visualPrompt":"…","subtitle":"…","plannedMs":${Math.round((BREAKDOWN_SPEC.shotMsMin + BREAKDOWN_SPEC.shotMsMax) / 2)},"energy":62,"sfxHint":"…","characters":["…"],"scene":"…","props":["…"]}]}`;
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
        ? Math.min(3000, Math.max(1000, Math.round(ms)))
        : 2000,
      energy: clampInt(o.energy, 0, 100, 60),
      sfxHint: str(o.sfxHint).slice(0, 12),
      characters: strArray(o.characters, 4),
      scene: str(o.scene).slice(0, 30),
      props: strArray(o.props, 3),
    });
  }
  if (shots.length < 2) return null;
  return shots;
}

/** 调用文本通道拆解一幕（带 2 次解析级重试），返回结构化镜头组 */
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

  // 幕级运镜池归位：池外值回退到该幕推荐池的轮转位
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
