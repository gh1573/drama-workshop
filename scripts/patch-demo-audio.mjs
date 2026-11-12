/**
 * 演示项目音频链路补丁（一次性，与 seed-demo-project.mjs 的配音协议同源）：
 * 1. 修正台词分布：order 3 大特写静默、order 8 承接 cliffhanger 台词、order 9 去重；
 * 2. voice_demo_*.wav → voice_{clipId}.wav（镜像 dispatcher voiceover 回写命名）；
 * 3. 落 subtitle × 3 + voiceover × 3 轨道条目（时间轴 = ΣplannedMs 累计，与 §7.7 对齐）。
 * 用法：node scripts/patch-demo-audio.mjs
 */
import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "public", "assets");
const db = new PrismaClient();

const PROJECT_TITLE = "战神逆袭 · 演示第一集";
const PLANNED_MS = 5000;

// order → { sub: 台词（空串=静默）, demo: 配音源文件 }
const VOICE_PLAN = {
  0: { sub: "「陈锋，你连给我提鞋都不配——滚出林家！」", demo: "voice_demo_hook.wav" },
  3: { sub: "" },
  6: { sub: "「北境统帅陈锋，今日——清账。」", demo: "voice_demo_climax.wav" },
  8: { sub: "「三年前泼我冷水的账……今天，连本带利。」", demo: "voice_demo_cliffhanger.wav" },
  9: { sub: "" },
};

async function main() {
  const project = await db.project.findFirst({
    where: { title: PROJECT_TITLE },
    select: { id: true },
  });
  if (!project) throw new Error("演示项目不存在，请先运行 seed-demo-project.mjs");
  const clips = await db.timelineClip.findMany({
    where: { projectId: project.id },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });

  let cursor = 0;
  const timings = new Map(); // clipId -> { startMs, endMs }
  for (const c of clips) {
    timings.set(c.id, { startMs: cursor, endMs: cursor + PLANNED_MS });
    cursor += PLANNED_MS;
  }

  let voiced = 0;
  for (const [orderStr, plan] of Object.entries(VOICE_PLAN)) {
    const clip = clips[Number(orderStr)];
    if (!clip) continue;
    await db.timelineClip.update({
      where: { id: clip.id },
      data: { subtitle: plan.sub },
    });
    // 同镜头旧轨道替换（重跑 = 更新，同 dispatcher 语义）
    await db.trackItem.deleteMany({
      where: { projectId: project.id, clipId: clip.id, kind: { in: ["subtitle", "voiceover"] } },
    });
    if (!plan.sub) continue;
    await db.trackItem.create({
      data: {
        projectId: project.id,
        kind: "subtitle",
        clipId: clip.id,
        startMs: timings.get(clip.id).startMs + 600,
        endMs: timings.get(clip.id).endMs - 400,
        text: plan.sub,
      },
    });
    if (plan.demo) {
      const src = join(ASSETS, plan.demo);
      if (!existsSync(src)) throw new Error(`配音源文件缺失：${plan.demo}`);
      const file = `voice_${clip.id}.wav`;
      copyFileSync(src, join(ASSETS, file));
      await db.trackItem.create({
        data: {
          projectId: project.id,
          kind: "voiceover",
          clipId: clip.id,
          startMs: timings.get(clip.id).startMs,
          endMs: timings.get(clip.id).endMs,
          text: plan.sub,
          style: JSON.stringify({ url: `/assets/${file}` }),
        },
      });
      voiced += 1;
    }
  }
  const counts = await db.trackItem.groupBy({
    by: ["kind"],
    where: { projectId: project.id },
    _count: true,
  });
  console.log(
    `补丁完成：配音 ${voiced} 段；轨道分布`,
    JSON.stringify(counts.map((c) => ({ kind: c.kind, n: c._count })))
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
