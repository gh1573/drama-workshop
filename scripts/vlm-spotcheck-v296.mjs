/**
 * v2.9.6 视觉抽检（VLM）：首屏转化五处改动的成立性
 * 01 首屏（双 CTA 统一 + 就绪信号区）/ 02 空点开机 toast 指路
 * 06 左列底部（试笔按钮 + 开机须知）/ 08 就绪态 / 09 示例成片因果链语境条
 * 用法：node scripts/vlm-spotcheck-v296.mjs
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";

const DIR = "/tmp/audit-v296";
const SHOTS = [
  "01-first-paint.png",
  "02-cta-empty-click-toast.png",
  "06-left-cta-bottom.png",
  "08-ready-to-roll.png",
  "09-right-mid.png",
];

const SYSTEM_PROMPT = `你是微短剧赛道的产品设计总监，正在做改动后的视觉抽检（只判断新改动是否成立，不重开全局走查）。
本轮改动（新用户首屏转化深化）：
1. 双 CTA 文案统一：左右两枚开机按钮主标同为「全组开机 · AI 剧组流水线」；
2. 空点开机不再只报错：toast 指引 + 自动滚动定位并聚焦左侧梗概输入框；
3. 主 CTA 下新增「先试笔 · 只推演剧本（零视频额度）」显式按钮 + 差异说明一行；
4. CTA 下方新增「开机须知」两行（剧本分钟内出稿/逐镜渲染可旁观；只补拍受影响镜头/断点续跑）；
5. 梗概输入区新增就绪信号（≥10 字变绿「梗概就绪 · 可开机」）；
6. 示例成片语境条升级为输入→输出因果链（同款梗概 · 默认快拍机组实产）。

对每张截图回答（严格遵守格式）：
**改动可见性**: 目标改动元素是否清晰可见（是/否 + 位置描述；若该截图不含改动则说明）
**视觉品质**: 与周边 UI 是否协调（密度/层级/字号/边框），有无破相（溢出/错位/违和色/遮挡）
**一句话结论**: 过 / 不过 + 原因`;

async function main() {
  const zai = await ZAI.create();
  let out = "# v2.9.6 视觉抽检\n\n";
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
  fs.writeFileSync(`${DIR}/SPOTCHECK-V296.md`, out);
  console.log("写入:", `${DIR}/SPOTCHECK-V296.md`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
