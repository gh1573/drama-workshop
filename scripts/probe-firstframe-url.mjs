#!/usr/bin/env bun
/**
 * 通道能力探测 II：image_url 接受公网 URL 吗？
 * 用仓库已提交的定妆图 raw 地址实测（受理 → 出片全链路）。
 * 用法：bun scripts/probe-firstframe-url.mjs [image_url]
 */
import ZAI from "z-ai-web-dev-sdk";

const DEFAULT_URL =
  "https://raw.githubusercontent.com/gh1573/drama-workshop/main/public/assets/asset_cmwbo7p9v0007p3vd0ap0z0yg.png";
const imageUrl = process.argv[2] ?? DEFAULT_URL;
console.log(`[probe] image_url = ${imageUrl}`);

const zai = await ZAI.create();

// 429 退避（通道对 create 敏感）
let created = null;
for (let attempt = 0; attempt < 4 && !created; attempt++) {
  try {
    created = await zai.video.generations.create({
      prompt:
        "[Characters] Chinese young woman, delicate oval face, waist-length black hair, gentle eyes; [Action] she looks into the camera and slowly smiles; [Camera] slow push-in; [Style] cinematic warm tone; [Technical] vertical 9:16 format, 5s duration, 720p",
      size: "720x1280",
      duration: 5,
      quality: "speed",
      fps: 30,
      with_audio: false,
      watermark_enabled: false,
      image_url: imageUrl,
    });
  } catch (e) {
    const msg = e.message ?? "";
    console.log(`[probe] create 失败（第${attempt + 1}次）: ${msg.slice(0, 200)}`);
    if (msg.includes("429")) {
      await new Promise((r) => setTimeout(r, 25_000));
      continue;
    }
    process.exit(1);
  }
}
if (!created?.id) {
  console.error("[probe] ✗ 未能受理");
  process.exit(1);
}
console.log(`[probe] ✓ 受理: ${created.id}`);

for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 10_000));
  let res;
  try {
    res = await zai.async.result.query(created.id);
  } catch (e) {
    console.log(`[probe] #${i + 1} 查询异常: ${(e.message ?? "").slice(0, 120)}`);
    continue;
  }
  console.log(`[probe] #${i + 1} ${res.task_status}`);
  if (res.task_status === "SUCCESS") {
    const url = res.video_result?.[0]?.url ?? res.video_url ?? res.url ?? res.video;
    console.log(`[probe] ✓✓ 公网 URL 参考图全链路出片: ${url}`);
    process.exit(0);
  }
  if (res.task_status === "FAIL") {
    console.error("[probe] ✗ 渲染失败");
    process.exit(2);
  }
}
console.error("[probe] 超时");
process.exit(3);
