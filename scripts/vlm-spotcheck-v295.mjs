/**
 * v2.9.5 视觉抽检（VLM）：三个新表面 + 一个回归面
 * 10-session-overview（信息卡系列连载区块）/ 16-next-episode-dialog（上集回顾 + AI 接钩子）
 * 15-tab-cut（制作包清单行）/ 05-config-genre-synopsis（拍摄配置提示行，回归面）
 * 用法：node scripts/vlm-spotcheck-v295.mjs
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";

const DIR = "/tmp/audit-v295";
const SHOTS = ["10-session-overview.png", "16-next-episode-dialog.png", "15-tab-cut.png", "05-config-genre-synopsis.png"];

const SYSTEM_PROMPT = `你是微短剧赛道的产品设计总监，正在做改动后的视觉抽检（只判断新改动是否成立，不重开全局走查）。
本轮改动：
1. 信息卡新增「系列连载」区块（剧集 chips + 续写第 N 集按钮）；
2. 续写弹窗新增「上集留钩」回顾条 + 「AI 接钩子写本集走向」按钮；
3. 成片交付区新增制作包内容清单行；
4. 拍摄配置面板尾部新增「进阶微调 · 拿不准就用默认机组直接开机」提示行。

对每张截图回答（严格遵守格式）：
**改动可见性**: 改动元素是否清晰可见（是/否 + 位置描述）
**视觉品质**: 与周边 UI 是否协调（字号/边框/密度/层级），有无破相（溢出/错位/违和色）
**一句话结论**: 过 / 不过 + 原因`;

async function main() {
  const zai = await ZAI.create();
  let out = "# v2.9.5 视觉抽检\n\n";
  for (const f of SHOTS) {
    const b64 = fs.readFileSync(`${DIR}/${f}`).toString("base64");
    const res = await zai.chat.completions.createVision({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
            { type: "text", text: `抽检截图：${f}` },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = res.choices[0]?.message?.content || "(空响应)";
    out += `## ${f}\n\n${content}\n\n---\n\n`;
    console.log(`抽检 ${f} ... done`);
  }
  fs.writeFileSync(`${DIR}/SPOTCHECK-V295.md`, out);
  console.log("写入:", `${DIR}/SPOTCHECK-V295.md`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
