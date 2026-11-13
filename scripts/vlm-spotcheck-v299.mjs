/**
 * v2.9.9 交付面视觉抽检（VLM）：落地页 / 工作台 / 剧组进程 / 成片 四视
 * 回答用户问题「流程跑通了吗？UI/UX 符合用户创作吗？」的实证部分。
 * 用法：bun scripts/vlm-spotcheck-v299.mjs
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";

const DIR = "/tmp/render";
const SHOTS = [
  ["shot-landing.png", "落地页（新用户空态首屏：左列梗概输入 + 右列示例实产信任链）"],
  ["shot-workbench.png", "工作台（种子项目载入后：六阶段进度 + 镜头轨 + 信息卡）"],
  ["shot-crew.png", "剧组进程页签（阶段进度 + 任务中心 + 场记日志）"],
  ["shot-final.png", "成片页签（交付区：合成/贴片指引/制作包清单）"],
];

const SYSTEM_PROMPT = `你是微短剧赛道的产品设计总监，对「AI 剧组生产流水线」做交付面终检。
产品背景：竖屏微短剧 AI 剧组（编剧→选角定妆→导演拆镜→锚定组装→后期成包六阶段），桌面端工作台。
本轮四张截图覆盖新用户首屏 → 在制项目工作台 → 剧组进程观测 → 成片交付全动线。

对每张截图回答（严格遵守格式，每项一行）：
**目标面可见性**: 该屏核心元素是否齐整可见（是/否 + 一句位置描述）
**专业语义**: 剧组语言（开机/杀青/拆镜/贴片/制作包等）使用是否专业自然，有无工程师黑话泄漏
**创作动线**: 从创作者视角，这一屏能否无歧义知道「我在哪、下一步干什么」
**过程反馈**: 异步动作（生成/渲染/合成）是否有可见的状态、进度或指引（该屏若无异步元素则写「不适用」）
**一句话结论**: 过 / 不过 + 原因`;

async function main() {
  const zai = await ZAI.create();
  let out = "# v2.9.9 交付面视觉抽检（四视）\n\n";
  let pass = 0, total = 0;
  for (const [f, desc] of SHOTS) {
    const b64 = fs.readFileSync(`${DIR}/${f}`).toString("base64");
    const res = await zai.chat.completions.createVision({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
            { type: "text", text: `抽检截图：${f}（${desc}）` },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });
    const text = res.choices[0]?.message?.content ?? "(空)";
    const ok = /结论[^]*过/.test(text.replace("不过", "【不过】")) && !text.includes("一句话结论: 不过") && !text.includes("一句话结论：不过");
    total++;
    if (ok) pass++;
    out += `## ${f} — ${desc}\n\n${text}\n\n---\n\n`;
    console.log(`${f}: ${text.split("\n").find((l) => l.includes("结论")) ?? "(无结论行)"}`);
  }
  out += `汇总：${pass}/${total} 过\n`;
  fs.writeFileSync("/tmp/render/vlm-v299-report.md", out);
  console.log(`\n汇总：${pass}/${total} 过（详报 /tmp/render/vlm-v299-report.md）`);
}

main().catch((e) => {
  console.error("VLM 抽检失败:", e.message);
  process.exit(1);
});
