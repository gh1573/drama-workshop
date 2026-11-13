/**
 * 诊断：编剧阶段 LLM 返回截断问题（v2.9.10 端到端走查发现）
 * 直接调用文本通道 + buildScreenplayMessages 真实提示词，
 * 输出 finish_reason（若可得）/文本长度/尾部 60 字符，判定截断来源。
 */
import { buildScreenplayMessages } from "../src/server/services/screenplay";
import { getTextProvider } from "../src/server/providers";

const messages = buildScreenplayMessages({
  genreName: "战神逆袭",
  genreBadge: "高燃打脸 · 爽感爆棚",
  hookTactic: "0~3s 冲突爆发：赘婿婚书当众受辱，主角眼神冰冷，身份信物若隐若现",
  musicMood: "重低音蓄势战鼓、霸气交响乐渐强、金属拔剑音效",
  tonePrompt: "cool tones with metallic highlights, cinematic",
  synopsis: "赘婿隐忍三年受尽欺凌，反派当众撕碎婚书泼菜汤；主角冷笑亮出信物，顶级统帅带十万将士破门而入跪地齐呼龙王！",
  durationSeconds: 5,
  resolution: "720p",
  thinkingLevel: "low",
  enhance: true,
});

const provider = getTextProvider();
const { text, finishReason, usage } = await provider.complete({
  messages,
  thinking: { type: "disabled" },
});
console.log("finishReason:", finishReason ?? "(provider 未透出)");
console.log("usage:", JSON.stringify(usage ?? null));
console.log("text length:", text.length);
console.log("head 40:", JSON.stringify(text.slice(0, 40)));
console.log("tail 80:", JSON.stringify(text.slice(-80)));
