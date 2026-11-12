/**
 * v2.5.2 工作台五页签 VLM 设计总监评审（零外部通道调用配额——仅图片理解）
 * 用法: node scripts/vlm-audit-workbench.mjs [截图目录]
 * 输出: 每张截图的评分 + 问题清单（markdown），写入 /tmp/wb-shots/AUDIT.md
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";

const DIR = process.argv[2] || "/tmp/wb-shots";
const OUT = path.join(DIR, "AUDIT.md");

const SYSTEM_PROMPT = `你是一位服务过顶级流媒体平台的资深 UI 设计总监，正在给「微短剧智能创编工坊」的工作台界面做专业走查。
这是一个深色主题的 AI 视频创作工具（类 IDE 布局：左侧配置面板 + 右侧多页签工作区），专业用户（编剧/制片人）每天要用数小时。

评审维度（每项 0-10 分）：
1. 信息层级——视觉权重是否引导用户先看最重要的内容
2. 留白与密度——是否呼吸感足够、不拥挤也不空洞
3. 色彩纪律——是否有失控的颜色、渐变滥用、语义色误用
4. 对齐与栅格——元素是否对齐、间距是否一致
5. 状态可读性——状态徽标/进度/空态是否一眼可懂
6. 操作可达性——关键 CTA 是否突出、危险操作是否有区分

输出格式（严格遵守）：
## 截图名
**总分: X/10**
**亮点**: （1-2条，具体到元素）
**问题清单**（按严重度排序，每条含 [severity:P0阻断/P1明显/P2打磨] + 位置描述 + 具体建议）:
- [P1] 位置 → 问题描述 → 修改建议
最后给一句整体改进方向。`;

async function reviewOne(zai, file) {
  const b64 = fs.readFileSync(path.join(DIR, file)).toString("base64");
  const res = await zai.chat.completions.createVision({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          {
            type: "text",
            text: `请评审这张工作台截图（${file}）。它是桌面端 1728x1080 视口。`,
          },
        ],
      },
    ],
    thinking: { type: "disabled" },
  });
  return res.choices[0]?.message?.content || "(空响应)";
}

async function main() {
  const zai = await ZAI.create();
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".png"))
    .sort();
  const out = ["# 工作台 VLM 设计评审 — " + new Date().toISOString().slice(0, 16), ""];
  for (const f of files) {
    process.stderr.write(`reviewing ${f} ...\n`);
    try {
      const r = await reviewOne(zai, f);
      out.push(r, "\n---\n");
    } catch (e) {
      out.push(`## ${f}\n评审失败: ${e.message}\n---\n`);
    }
  }
  fs.writeFileSync(OUT, out.join("\n"));
  console.log("written:", OUT);
}

main().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
