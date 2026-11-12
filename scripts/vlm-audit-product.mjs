/**
 * 全局产品走查 VLM 评审（产品总监视角，非设计/bug 视角）
 * 用法: node scripts/vlm-audit-product.mjs [截图目录]
 * 输出: /tmp/wb-shots/PRODUCT-AUDIT.md
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";

const DIR = process.argv[2] || "/tmp/home-shots";
const OUT = path.join(DIR, "PRODUCT-AUDIT.md");

const SYSTEM_PROMPT = `你是微短剧赛道的资深产品负责人（做过剪辑工具和 AIGC 内容平台的从 0 到 1），正在评审「AI 剧组流水线」产品界面截图。
产品定位：用户只需输入「题材+一句话梗概」，AI 剧组（编剧/选角/导演/场记/后期）自动完成剧本→定妆→拆镜→渲染→成片，产出 40-60 秒竖屏短剧，支持系列连载。
目标用户：不懂运镜/景别/轴线的普通创作者和短剧工作室运营者。

请从产品全局视角评审（不是 UI bug 走查）：
1. 价值主张可见性——新用户 30 秒内能否明白产品是干什么的、产出什么？
2. 核心动线——从落地到拿到成片的主路径是否清晰、有没有断层或死角？
3. 信任建立——用户凭什么相信 AI 产出的质量？过程透明度/可干预点/失败兜底是否可见？
4. 连载生产——系列/多集续产的产品能力是否被表达出来？
5. 结果交付——成片之外的制作包（定妆图/字幕/配音）是否可见、可下载？
6. 产品成熟度印象——这像 demo、工具还是可运营的产品？缺什么关键一环？

输出格式（严格遵守）：
## 截图名
**产品印象: 一句话**
**做对了**: （1-3条，具体）
**产品缺口**（按影响排序，标注 [P0战略缺口/P1体验断层/P2增强] + 证据 + 建议）:
- [P1] 证据 → 建议
**如果只改一件事**: 一句话`;

async function reviewOne(zai, file) {
  const b64 = fs.readFileSync(path.join(DIR, file)).toString("base64");
  const res = await zai.chat.completions.createVision({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          { type: "text", text: `请从产品全局视角评审这张截图（${file}）。` },
        ],
      },
    ],
    thinking: { type: "disabled" },
  });
  return res.choices[0]?.message?.content || "(空响应)";
}

const zai = await ZAI.create();
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png")).sort();
let report = `# 全局产品走查（产品总监视角）\n\n> 截图目录: ${DIR}\n\n`;
for (const f of files) {
  process.stdout.write(`评审 ${f} ... `);
  const r = await reviewOne(zai, f);
  report += `\n${r}\n\n---\n\n`;
  console.log("done");
}
fs.writeFileSync(OUT, report);
console.log("写入:", OUT);
