#!/usr/bin/env bun
/**
 * 通道能力探测：视频生成 image_url 是否接受 base64 data URI（§7.1.4 参考图注入前置验证）
 *
 * 背景：定妆图落盘在 public/assets/（本地相对路径），外部视频通道无法回源访问。
 * 若通道接受 data URI，则参考图注入可完全自包含（读本地文件 → base64 → image_url），
 * 无需公网托管。本脚本用一张既有定妆图实测，产物只验证受理与出片，不落业务库。
 *
 * 用法：bun scripts/probe-firstframe.mjs [png路径]
 */
import ZAI from "z-ai-web-dev-sdk";
import { readFileSync } from "node:fs";
import path from "node:path";

const png =
  process.argv[2] ?? path.join(process.cwd(), "public/assets/asset_cmwbo7p9v0007p3vd0ap0z0yg.png");
const buf = readFileSync(png);
const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
console.log(`[probe] 定妆图 ${png} (${(buf.length / 1024).toFixed(0)}KB) → data URI (${(dataUri.length / 1024).toFixed(0)}KB)`);

const zai = await ZAI.create();
const created = await zai.video.generations.create({
  prompt:
    "[Characters] Chinese young woman, delicate oval face, waist-length black hair; [Action] she turns her head slowly toward the camera and smiles; [Camera] slow push-in; [Style] cinematic warm tone; [Technical] vertical 9:16 format, 5s duration, 720p",
  size: "720x1280",
  duration: 5,
  quality: "speed",
  fps: 30,
  with_audio: false,
  watermark_enabled: false,
  image_url: dataUri,
});
console.log("[probe] 受理结果:", JSON.stringify(created));
if (!created?.id) {
  console.error("[probe] ✗ 未返回任务句柄 —— 通道拒绝 data URI");
  process.exit(1);
}

console.log("[probe] 轮询出片…");
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 8_000));
  const res = await zai.async.result.query(created.id);
  console.log(`[probe] #${i + 1} ${res.task_status}`);
  if (res.task_status === "SUCCESS") {
    const url = res.video_result?.[0]?.url ?? res.video_url ?? res.url ?? res.video;
    console.log(`[probe] ✓ data URI 参考图被接受并出片: ${url}`);
    process.exit(0);
  }
  if (res.task_status === "FAIL") {
    console.error("[probe] ✗ 任务失败 —— data URI 可能被拒或内容不合规");
    process.exit(2);
  }
}
console.error("[probe] 超时未出片");
process.exit(3);
