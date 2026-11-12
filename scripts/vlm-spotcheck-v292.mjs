import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";

const files = ["v292-home.png", "v292-library.png", "v292-assets.png", "v292-rhythm.png"];
const zai = await ZAI.create();
for (const f of files) {
  const b64 = fs.readFileSync(`/tmp/${f}`).toString("base64");
  const res = await zai.chat.completions.createVision({
    messages: [
      { role: "system", content: "你是 UI 质检员，只报告确实可见的问题，不臆测。" },
      { role: "user", content: [
        { type: "text", text: `检查这张截图（${f}）：1) 落地页视频播放器区域是否显示有内容的画面（非黑屏）？2) 是否有「开机不是放手不管」声明条？3) 项目库卡片是否有「成片/制作包」下载入口？4) 资产页是否有绿色「本集成片已就绪」入口条？5) 节奏页达标清单是否 4 项达标？6) 有无明显布局破损/文字溢出/元素重叠？仅针对本图能看到的回答，输出 JSON：{"poster": true/false/null, "strip": ..., "chips": ..., "entryBar": ..., "meters": ..., "defects": "一句话或无"}` },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
      ] },
    ],
    max_tokens: 300,
  });
  console.log(f, "→", res.choices[0].message.content.trim().slice(0, 400));
}
