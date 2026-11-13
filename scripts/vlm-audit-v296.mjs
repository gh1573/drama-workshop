/**
 * v2.9.6 VLM 走查：新用户「首屏转化」面深化审计
 * 视角：微短剧赛道产品设计总监，模拟一个从未见过本产品的新用户，
 * 从落地到「敢按下全组开机」的转化路径逐视审查。
 * 用法：node scripts/vlm-audit-v296.mjs
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";

const DIR = "/tmp/audit-v296";
const SHOTS = [
  "01-first-paint.png",
  "02-cta-empty-click-toast.png",
  "04-left-synopsis.png",
  "05-left-model.png",
  "07-synopsis-filled.png",
  "08-ready-to-roll.png",
  "09-right-mid.png",
  "11-sample-video-playing.png",
];

const SYSTEM_PROMPT = `你是微短剧赛道的产品设计总监。产品是「AI 剧组」：用户选题材、写一句梗概、点「全组开机」，AI 编剧→选角定妆→拆镜→锚定→后期，直出 9:16 竖屏短剧成片。

本轮审计主题：新用户首屏转化。模拟一个从未见过产品的新用户（短剧创作者/运营者），回答以下问题：

**10 秒理解**: 新用户 10 秒内能否说清「这是什么、对我有什么用」？哪里强哪里弱？
**行动指引**: 新用户下一步该做什么是否明确？主 CTA 是否够醒目、路径是否够短？
**信任建立**: 敢不敢直接按下「全组开机」（这会消耗视频生成额度且等待时间不短）？缺什么信息（耗时预期/花费/样例质量/可干预性）？
**残留疑虑**: 这个视图里最可能让新用户流失的一个点是什么？

要求：只说真问题，不复述明显正常的部分；每条判断给出截图中的具体证据（元素位置/文案）；用中文；不要客套话。`;

async function main() {
  const zai = await ZAI.create();
  let out = "# v2.9.6 新用户首屏转化 VLM 走查\n\n";
  for (const f of SHOTS) {
    const b64 = fs.readFileSync(`${DIR}/${f}`).toString("base64");
    const res = await zai.chat.completions.createVision({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
            { type: "text", text: `走查截图：${f}（1728×1080 桌面端）` },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = res.choices[0]?.message?.content || "(空响应)";
    out += `## ${f}\n\n${content}\n\n---\n\n`;
    console.log(`走查 ${f} ... done`);
  }
  fs.writeFileSync(`${DIR}/AUDIT-V296.md`, out);
  console.log("写入:", `${DIR}/AUDIT-V296.md`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
