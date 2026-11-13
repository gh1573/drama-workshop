/**
 * v2.9.6 视觉抽检（VLM）· 第二批：剧本过稿开机两视
 * 12 试笔后首次开机主 CTA / 13 改梗概后诚实翻转态
 * 用法：node scripts/vlm-spotcheck-approved-boot.mjs
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";

const DIR = "/tmp/audit-v296";
const SHOTS = ["12-trial-firstboot.png", "13-trial-flip.png"];

const SYSTEM_PROMPT = `你是微短剧赛道的产品设计总监，正在做改动后的视觉抽检（只判断新改动是否成立，不重开全局走查）。
本轮改动（剧本过稿开机——试笔→开机的转化承接）：
1. 试笔（只推演剧本）成功后，左列配置折叠，折叠区下方常驻品牌渐变主 CTA「全组开机 · 按已过目剧本拍摄」+ 副行「剧本已过稿 · 开机不重写——直接选角定妆 → 导演拆镜 → 后期成片」；红色破坏性「按新配置重新开机」不再出现；
2. 用户改了梗概后，同一位置 CTA 翻转为「全组开机 · AI 剧组流水线」，副行诚实提示「开机时编剧室将按当前输入重写剧本」（配置折叠区展开，梗概输入框可见）。

对每张截图回答（严格遵守格式）：
**改动可见性**: 目标改动元素是否清晰可见（是/否 + 位置描述）
**视觉品质**: 与周边 UI 是否协调（层级/字号/密度），有无破相；CTA 是否足够醒目、是否与右侧或其他元素打架
**转化判断**: 从「刚读完 AI 剧本的新用户」视角，这一屏能否无歧义地知道下一步动作
**一句话结论**: 过 / 不过 + 原因`;

async function main() {
  const zai = await ZAI.create();
  let out = "# v2.9.6 视觉抽检 · 剧本过稿开机\n\n";
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
  fs.writeFileSync(`${DIR}/SPOTCHECK-APPROVED-BOOT.md`, out);
  console.log("写入:", `${DIR}/SPOTCHECK-APPROVED-BOOT.md`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
