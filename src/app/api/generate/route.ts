import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { GENRES } from "@/lib/genres";
import { fail, ok, handleRouteError } from "@/lib/api-utils";
import {
  ACT_MOVEMENT_POOLS,
  CAMERA_MOVEMENTS,
  NARRATIVE_META,
  StoryBeat,
  NarrativeFunction,
} from "@/lib/drama";

export const maxDuration = 300;

const POOL_DESC: Record<NarrativeFunction, string> = {
  hook: ACT_MOVEMENT_POOLS.hook
    .map((k) => `${k}=${CAMERA_MOVEMENTS[k].label}`)
    .join("、"),
  climax: ACT_MOVEMENT_POOLS.climax
    .map((k) => `${k}=${CAMERA_MOVEMENTS[k].label}`)
    .join("、"),
  cliffhanger: ACT_MOVEMENT_POOLS.cliffhanger
    .map((k) => `${k}=${CAMERA_MOVEMENTS[k].label}`)
    .join("、"),
};

const PACING_FALLBACK: Record<NarrativeFunction, string> = {
  hook: "0~3s 强冲突切入！拒绝无效铺垫，拉满情绪张力",
  climax: "4~8s 顶级反转登场，局势瞬间颠覆",
  cliffhanger: "9~12s 意犹未尽，悬念卡点让观众欲罢不能",
};

function buildSystemPrompt(thinkingLevel: string, enhance: boolean): string {
  const levelDesc =
    thinkingLevel === "high"
      ? "伏笔回收模式：第一幕埋入一个不起眼的道具/细节伏笔，第三幕反转时回收该伏笔，制造双重反转"
      : thinkingLevel === "medium"
        ? "节奏铺垫模式：第一幕冲突前允许 1 拍情绪铺垫，随后立即爆点"
        : "直给爆点模式：第一幕 0 秒直接进入最强冲突，拒绝任何铺垫";

  const enhanceDesc = enhance
    ? "【提示词增强已开启】每幕的 promptGuidance 需在中文镜头提示末尾追加 2~3 个英文电影级关键词（如 cinematic lighting, slow motion, anamorphic flare, shallow depth of field），用逗号自然衔接，强化 AI 视频出片质量。"
    : "【提示词增强已关闭】promptGuidance 仅使用中文镜头提示。";

  return `你是一位顶级竖屏微短剧编剧兼分镜导演，精通 9:16 黄金三幕结构与 AI 视频提示词工程，作品以"3 秒抓人、8 秒反转、12 秒留钩"著称。

【任务】根据用户提供的【题材预设】与【剧情梗概】，产出一支约 12 秒竖屏短剧的完整三幕分镜脚本，严格输出 JSON。

【三幕结构（必须严格遵守）】
- 第 1 幕 narrativeFunction=hook（0~3s 黄金开头）：actTitle 固定为「第一幕：极致冲突 (黄金开头 Hook)」
- 第 2 幕 narrativeFunction=climax（4~8s 绝地反转）：actTitle 固定为「第二幕：身份揭晓 (绝地反转 Clash)」
- 第 3 幕 narrativeFunction=cliffhanger（9~12s 卡点留钩）：actTitle 固定为「第三幕：致命悬念 (卡点留钩 Cliffhanger)」

【节奏策略（本次采用）】${levelDesc}

【三幕梯级运镜调度（视听导演硬约束）】
三幕必须呈现递进的视角层次，禁止同质化：
- 第 1 幕 hook（锁定/冲击类）：${POOL_DESC.hook}
- 第 2 幕 climax（排场/压迫类）：${POOL_DESC.climax}
- 第 3 幕 cliffhanger（炫技/悬念类）：${POOL_DESC.cliffhanger}
每幕只能从本幕推荐池中选择 cameraMovement，且三幕之间不得重复；整体效果应形成「特写锁定 → 仰角/大景深排场 → 环绕/变焦炫技」的视角递进。

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
    {
      "index": 1,
      "actTitle": "第一幕：极致冲突 (黄金开头 Hook)",
      "narrativeFunction": "hook",
      "pacingNote": "0~3s 强冲突切入！拒绝无效铺垫，拉满情绪张力",
      "description": "……",
      "dialogueSubtitle": ""……"",
      "cameraMovement": "push",
      "promptGuidance": "……"
    },
    { "index": 2, ... },
    { "index": 3, ... }
  ]
}`;
}

function buildUserMessage(payload: {
  genreName: string;
  genreBadge: string;
  hookTactic: string;
  musicMood: string;
  tonePrompt: string;
  synopsis: string;
  duration: number;
  resolution: string;
  thinkingLevel: string;
  enhance: boolean;
}): string {
  return `【题材预设】
题材：${payload.genreName}（${payload.genreBadge}）
黄金3秒钩子策略：${payload.hookTactic}
建议配乐音效：${payload.musicMood}
英文影调锚点：${payload.tonePrompt}

【剧情梗概】
${payload.synopsis}

【模型配置】
单镜时长：${payload.duration} 秒 | 分辨率：${payload.resolution} | 剧本思考深度：${payload.thinkingLevel} | 提示词增强：${payload.enhance ? "开启" : "关闭"}

请基于以上信息生成三幕分镜 JSON。`;
}

/** 从模型输出中稳健地抽取 storyBeats */
function parseBeats(raw: string): StoryBeat[] | null {
  if (!raw) return null;
  let text = raw.trim();
  // 去掉 markdown 围栏
  text = text.replace(/```(?:json)?/gi, "").trim();
  // 截取第一个 { 到最后一个 }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const arr = (data as { storyBeats?: unknown[] })?.storyBeats;
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
    });
  }
  // 运镜合规修复：池外运镜 → 回退到本幕推荐池；三幕互斥 → 依次换池内备选
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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      genreId?: string;
      synopsis?: string;
      modelConfig?: {
        videoModel?: string;
        durationSeconds?: number;
        resolution?: string;
        scriptThinkingLevel?: "low" | "medium" | "high";
        enablePromptEnhance?: boolean;
      };
    };

    const genre = GENRES.find((g) => g.id === body.genreId);
    if (!genre) {
      return fail("未知的题材，请重新选择", 400);
    }
    const synopsis = (body.synopsis ?? "").trim();
    if (synopsis.length < 10) {
      return fail("剧情梗概太短，请输入至少 10 个字的梗概", 400);
    }

    const cfg = body.modelConfig ?? {};
    const thinkingLevel = ["low", "medium", "high"].includes(
      cfg.scriptThinkingLevel ?? ""
    )
      ? (cfg.scriptThinkingLevel as "low" | "medium" | "high")
      : "low";
    const enhance = cfg.enablePromptEnhance !== false;
    const duration = [3, 5, 8].includes(cfg.durationSeconds ?? 5)
      ? (cfg.durationSeconds ?? 5)
      : 5;
    const resolution = ["540p", "720p", "1080p"].includes(cfg.resolution ?? "")
      ? (cfg.resolution as string)
      : "720p";

    const zai = await ZAI.create();
    const userMsg = buildUserMessage({
      genreName: genre.name,
      genreBadge: genre.badge,
      hookTactic: genre.hookTactic,
      musicMood: genre.musicMood,
      tonePrompt: genre.tonePrompt,
      synopsis,
      duration,
      resolution,
      thinkingLevel,
      enhance,
    });

    let beats: StoryBeat[] | null = null;
    let lastRaw = "";
    for (let attempt = 0; attempt < 2 && !beats; attempt++) {
      try {
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: "assistant",
              content: buildSystemPrompt(thinkingLevel, enhance),
            },
            {
              role: "user",
              content:
                attempt === 0
                  ? userMsg
                  : `${userMsg}\n\n注意：上一次输出无法解析。请严格只输出一个合法 JSON 对象（含 storyBeats 数组），不要任何其他文字。`,
            },
          ],
          thinking: { type: thinkingLevel === "low" ? "disabled" : "enabled" },
        });
        lastRaw = completion.choices[0]?.message?.content ?? "";
        beats = parseBeats(lastRaw);
      } catch (err) {
        lastRaw = err instanceof Error ? err.message : String(err);
      }
    }

    if (!beats) {
      return fail(
        "AI 返回内容未能通过解析，请稍后重试或调整梗概后重试",
        502,
        lastRaw.slice(0, 300)
      );
    }

    return ok({ storyBeats: beats });
  } catch (err) {
    return handleRouteError(err);
  }
}
