#!/usr/bin/env bun
/**
 * 通道能力探测 III（后台长退避版）：406 响应体完整捕获。
 * 通道当前处于长限流窗口，用 5 分钟级退避反复尝试，直到拿到一次非 429 响应。
 * 输出追加写入 /tmp/probe406.log
 */
import ZAI from "z-ai-web-dev-sdk";

const imageUrl =
  "https://raw.githubusercontent.com/gh1573/drama-workshop/main/public/assets/asset_cmwbo7p9v0007p3vd0ap0z0yg.png";
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const zai = await ZAI.create();
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    const r = await zai.video.generations.create({
      prompt: "a cat sitting still, vertical framing",
      size: "720x1280",
      duration: 5,
      image_url: imageUrl,
    });
    log(`ACCEPTED: ${JSON.stringify(r)}`);
    process.exit(0);
  } catch (e) {
    const msg = e.message ?? String(e);
    if (msg.includes("429")) {
      log(`#${attempt} 429 限流，240s 后重试`);
      await new Promise((r) => setTimeout(r, 240_000));
      continue;
    }
    log(`NON-429 RESPONSE: ${msg}`); // 406 等真实错误体在这里
    process.exit(2);
  }
}
log("12 次均为 429，放弃");
process.exit(3);
