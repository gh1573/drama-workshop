import ZAI from "z-ai-web-dev-sdk";
import {
  ACT_MOVEMENT_POOLS,
  CAMERA_MOVEMENTS,
  SHOT_SIZES,
  type ShotBreakdownItem,
  type StoryBeat,
} from "@/lib/drama";

/**
 * 分镜拆解服务（LLM 层）—— 把一幕剧情拆成 3~5 个镜头组，
 * 对齐真实微短剧工业流程：每集 10~20 个分镜、正反打剪辑、
 * 每 1~3 秒一次景别切换。持久化由 project-service.replaceActClips 完成。
 */

export interface BreakdownContext {
  genreName: string;
  genreBadge: string;
  tonePrompt: string;
  synopsis: string;
  beats: StoryBeat[];
  targetIndex: number;
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

  return `你是一位竖屏微短剧的资深分镜师（Shot List Writer），服务于真实短剧承制团队。你的任务是把单幕剧情拆解为一组连续镜头，形成可执行拍摄的分镜脚本。

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

【拆解规则（严格遵守）】
1. 输出 3~5 个镜头，每个镜头 1~3 秒（plannedMs 1000~3000），合计不超过该幕时长
2. 景别 shotSize 只能从：${SHOT_SIZES.join("/")} 中选择，相邻镜头景别必须不同（正反打优先：A 特写 → B 大特写 → 全景反应 → 主角近景）
3. 运镜 cameraMovement 只能从本幕推荐池中选择：${poolDesc}；同一幕内尽量不重复
4. visualDesc：25~60 字，完全可视化（人物、动作、表情、环境、光效），禁止抽象抒情
5. subtitle：该镜头画面内字幕；普通镜头可为空字符串 ""，全幕金句只出现 1 次
6. name：8 字以内的镜头标题，如「宴会厅 · 众人震惊」「黑卡 · 道具特写」
7. 情绪必须递进：从该幕的开场状态推向幕尾状态

【输出格式】只输出 JSON，禁止解释文字、禁止 markdown 围栏：
{"shots":[{"name":"…","shotSize":"特写","cameraMovement":"push","visualDesc":"…","subtitle":"…","plannedMs":2000}]}`;
}

function parseShots(raw: string): ShotBreakdownItem[] | null {
  if (!raw) return null;
  let text = raw.trim().replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const arr = (data as { shots?: unknown[] })?.shots;
  if (!Array.isArray(arr) || arr.length < 2) return null;

  const shots: ShotBreakdownItem[] = [];
  for (const item of arr.slice(0, 5)) {
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
      subtitle: str(o.subtitle).slice(0, 120),
      plannedMs: Number.isFinite(ms) ? Math.min(3000, Math.max(1000, Math.round(ms))) : 2000,
    });
  }
  if (shots.length < 2) return null;
  return shots;
}

/** 调用 GLM 拆解一幕（带 2 次重试），返回结构化镜头组 */
export async function breakdownAct(
  ctx: BreakdownContext
): Promise<ShotBreakdownItem[]> {
  const prompt = buildBreakdownPrompt(ctx);
  const zai = await ZAI.create();

  let shots: ShotBreakdownItem[] | null = null;
  let lastRaw = "";
  for (let attempt = 0; attempt < 2 && !shots; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
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
      lastRaw = completion.choices[0]?.message?.content ?? "";
      shots = parseShots(lastRaw);
    } catch (err) {
      lastRaw = err instanceof Error ? err.message : String(err);
    }
  }
  if (!shots) {
    throw new BreakdownError(
      "AI 分镜拆解结果解析失败，请重试",
      lastRaw.slice(0, 300)
    );
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
