/**
 * v2.9.9 deleteProject 磁盘级联清理验收（零外部通道）：
 * 历史缺口：deleteProject 只级联删 DB 行，磁盘素材全成孤儿；手工清理曾险些
 * 误删种子项目定妆照（引用字段是 Asset.portraitUrl 而非 asset_{id} 命名推导）。
 *
 * 断言：
 * 1. 删项目 → 镜头成片 clip_{id}.mp4 文件随之清除
 * 2. 删项目 → BGM 约定对（bgm_{pid}.{ext} + bgm_{pid}.json）随之清除
 * 3. 删项目 → 其余项目（种子）的磁盘文件一个不少（跨项目零误伤）
 * 4. DB 行级联：项目/片段/轨道全消
 * 5. 幂等：重复删除返回 404 不炸
 * 用法：bun scripts/verify-delete-cascade.mjs
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const db = new PrismaClient();
const ASSETS = "public/assets";

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
  ok ? pass++ : fail++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = async (f) => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {}
  const { existsSync } = await import("node:fs");
  return existsSync(`${ASSETS}/${f}`);
};

const api = async (url, init) => {
  const res = await fetch(BASE + url, init);
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

// ===== 0. 夹具：零配额建项目 + 1 镜 + 直落素材文件 =====
const seedFilesBefore = (await db.asset.findMany({ select: { portraitUrl: true } }))
  .map((a) => a.portraitUrl?.split("/").pop())
  .filter(Boolean);

const created = await api("/api/projects", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    genre: {
      id: "test", name: "删除级联单测", badge: "单测",
      hookTactic: "t", musicMood: "t", tonePrompt: "t",
    },
    synopsis: "v2.9.9 删除级联验收（零配额，自动清理）",
    modelConfig: {
      videoModel: "Omni 1.2 Flash", durationSeconds: 5, resolution: "720p",
      scriptThinkingLevel: "low", enablePromptEnhance: true,
    },
  }),
});
const pid = created.json?.data?.id ?? created.json?.id;
check("夹具：项目创建", Boolean(pid), pid ?? "");

await api(`/api/projects/${pid}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    storyBeats: [1, 2, 3].map((i) => ({
      index: i,
      actTitle: `单测场 ${i}`,
      narrativeFunction: i === 1 ? "hook" : i === 2 ? "buildup" : "cliffhanger",
      pacingNote: "0~12s",
      description: "删除级联单测场次",
      dialogueSubtitle: "单测台词",
      cameraMovement: "固定机位",
      promptGuidance: "t",
    })),
  }),
});
const clipRes = await api(`/api/projects/${pid}/clips`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ beatIndex: 1, name: "单测镜", subtitle: "", format: "mp4" }),
});
const clipId = clipRes.json?.data?.id ?? clipRes.json?.id;
check("夹具：镜头创建", Boolean(clipId), `${clipId ?? ""} HTTP ${clipRes.status} ${JSON.stringify(clipRes.json).slice(0, 120)}`);

// 直落素材文件（不走生成通道）：镜头成片 + BGM 约定对
const clipFile = `clip_${clipId}.mp4`;
const bgmAudio = `bgm_${pid}.mp3`;
const bgmMeta = `bgm_${pid}.json`;
writeFileSync(`${ASSETS}/${clipFile}`, "fake-clip-for-delete-cascade");
writeFileSync(`${ASSETS}/${bgmAudio}`, "fake-bgm");
writeFileSync(`${ASSETS}/${bgmMeta}`, "{}");
// 镜头标记本地成片（/assets/ 本地路径 v2.9.8 起合法）
const patch = await api(`/api/clips/${clipId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mediaUrl: `/assets/${clipFile}`, status: "ready" }),
});
check("夹具：镜头贴本地成片（/assets/ 合法）", patch.json?.ok !== false, `HTTP ${patch.status}`);

// ===== 1. 删除项目 → 磁盘级联 =====
const del = await api(`/api/projects/${pid}`, { method: "DELETE" });
check("删除：API 成功", del.json?.ok === true);
await sleep(800);

check("级联：镜头成片文件已清", !(await exists(clipFile)), clipFile);
check("级联：BGM 音频已清", !(await exists(bgmAudio)), bgmAudio);
check("级联：BGM 元数据已清", !(await exists(bgmMeta)), bgmMeta);

// ===== 2. 跨项目零误伤：种子项目文件全在 =====
const missing = [];
for (const f of seedFilesBefore) if (!(await exists(f))) missing.push(f);
check("零误伤：种子项目定妆照一个不少", missing.length === 0, missing.join(",") || `${seedFilesBefore.length} 个全在`);

// ===== 3. DB 级联 + 幂等 =====
const clipRow = await db.timelineClip.findFirst({ where: { projectId: pid } });
const trackRow = await db.trackItem.findFirst({ where: { projectId: pid } });
check("DB 级联：片段/轨道行全消", !clipRow && !trackRow);
const delAgain = await api(`/api/projects/${pid}`, { method: "DELETE" });
check("幂等：重复删除 404 不炸", delAgain.status === 404, `HTTP ${delAgain.status}`);

console.log(`\n结果：${pass}/${pass + fail} 通过`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
