import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";

const files = ["f6.jpg","f12.jpg","f18.jpg","f24.jpg","f30.jpg","f36.jpg","f42.jpg"];
const zai = await ZAI.create();
const content = [
  { type: "text", text: "这 7 张是同一部 47 秒竖屏短剧在 6/12/18/24/30/36/42 秒处的帧（按顺序编号 1-7）。请从中选出最适合做视频封面海报的一帧：要求画面最有戏剧张力/情绪浓度最高、画面主体清晰、亮度足够（避免大面积暗部或黑场转场帧）、适合吸引路人在信息流里点开。只输出 JSON：{\"pick\": <编号1-7>, \"reason\": \"一句话\"}" },
  ...files.map((f) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(`/tmp/poster-frames/${f}`).toString("base64")}` } })),
];
const res = await zai.chat.completions.createVision({
  messages: [
    { role: "system", content: "你是短视频封面编辑，只输出 JSON。" },
    { role: "user", content },
  ],
  max_tokens: 200,
});
console.log(res.choices[0].message.content);
