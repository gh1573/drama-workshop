/**
 * 重渲染清单（v2.9.4 任务③准备）：旧晃动视频重渲染就绪工具。
 *
 * 背景（三原则①）：v2.8.2 摄影纪律落地（commit e658549，2026-11-12T04:50:42Z）
 * 之前渲染的成片存在「意外抖动」——纪律之后的提示词自带执行设备/受控限定
 * （手持/甩镜/荷兰倾斜作为正当电影技法保留，但必须受控）。
 *
 * 本工具只做三件零配额的事，绝不调用任何生成通道：
 * 1. 盘点：全库镜头按「提示词状态 × 成片年代」双轴分类——
 *    - 提示词状态：up_to_date（= 现组装器逐字节一致）/ stale_anchor（锚点过期，
 *      可 --apply 零配额重锚）/ unanchored（未组装）；
 *    - 成片年代：媒体文件 mtime < 纪律截止 = pre_discipline_render（待重渲染）；
 * 2. 重锚（--apply）：stale_anchor 镜头用真组装器现算回写 finalPrompt/promptVersion
 *    （与 run-service 同代码路径，确定性映射纪律）；
 * 3. 出执行单：配额窗口打开后逐镜重渲染的 curl 命令清单
 *    （POST /api/projects/:id/tasks {"kind":"video","clipId"}，协议与 createTask 一致），
 *    写入 db/rerender-manifest.json（本机状态，不入库）。
 *
 * 用法：
 *   bun scripts/rerender-manifest.mjs            # 盘点 + 出执行单（零写库）
 *   bun scripts/rerender-manifest.mjs --apply    # 盘点 + 重锚过期镜头（零生成）
 */
import { PrismaClient } from "@prisma/client";
import { statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { composeVideoPrompt } from "../src/server/engines/prompt-engine";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

/** 摄影纪律落地时刻（commit e658549）：早于它的成片 = 旧渲染 */
const DISCIPLINE_CUTOFF = new Date("2026-11-12T04:50:42Z").getTime();

/** 风格化机位（正当电影技法，重渲染版自动带受控限定词） */
const STYLED_CAMS = new Set(["handheld", "whip_pan", "dutch_tilt"]);

const db = new PrismaClient();

async function main() {
  const projects = await db.project.findMany({
    include: { series: true },
    orderBy: { createdAt: "asc" },
  });
  const manifest = {
    generatedAt: new Date().toISOString(),
    disciplineCutoff: "2026-11-12T04:50:42Z (commit e658549 运镜防抖纪律)",
    note: "执行单仅在本工具输出，不自动触发任何生成通道；配额窗口打开后由人工执行",
    projects: [],
  };
  let total = 0, needRerender = 0, applied = 0;

  for (const p of projects) {
    const clips = await db.timelineClip.findMany({
      where: { projectId: p.id },
      orderBy: { order: "asc" },
      include: { refs: { include: { asset: true } } },
    });
    if (clips.length === 0) continue;
    const pEntry = {
      projectId: p.id,
      title: p.title,
      series: p.series ? `${p.series.title} · 第 ${p.episodeNo ?? "?"} 集` : "独立项目",
      clips: [],
    };

    for (const clip of clips) {
      total++;
      // —— 提示词状态：现组装器复算对比 ——
      const characters = clip.refs
        .filter((r) => r.asset.kind === "character")
        .map((r) => ({ name: r.asset.name, visualAnchor: r.asset.visualAnchor, stateNote: r.stateNote }));
      const sceneRef = clip.refs.find((r) => r.asset.kind === "scene");
      const props = clip.refs
        .filter((r) => r.asset.kind === "prop")
        .map((r) => ({ name: r.asset.name, visualAnchor: r.asset.visualAnchor, stateNote: r.stateNote }));
      const recomputed = composeVideoPrompt({
        shot: {
          visualDesc: clip.visualDesc ?? "",
          visualPrompt: clip.visualPrompt,
          cameraMovement: clip.cameraMovement,
          shotSize: clip.shotSize,
        },
        characters,
        scene: sceneRef ? { name: sceneRef.asset.name, visualAnchor: sceneRef.asset.visualAnchor, stateNote: sceneRef.stateNote } : null,
        props,
        tonePrompt: p.tonePrompt,
        aspectRatio: "9:16",
        plannedMs: clip.plannedMs,
        resolution: p.resolution,
      });
      const promptState = !clip.finalPrompt
        ? "unanchored"
        : clip.finalPrompt === recomputed.finalPrompt && clip.promptVersion === recomputed.fingerprint
          ? "up_to_date"
          : "stale_anchor";

      // —— 成片年代：本机媒体文件 mtime vs 纪律截止 ——
      let mediaVintage = "no_local_media";
      let mediaMtime = null;
      if (clip.mediaUrl?.startsWith("/assets/")) {
        try {
          const st = statSync(join(ROOT, "public", clip.mediaUrl));
          mediaMtime = st.mtime.toISOString();
          mediaVintage = st.mtime.getTime() < DISCIPLINE_CUTOFF ? "pre_discipline_render" : "post_discipline_render";
        } catch { /* 文件缺失按无本地媒体处理 */ }
      }

      // —— 重锚（--apply 时零配额写库） ——
      let reanchored = false;
      if (APPLY && promptState === "stale_anchor") {
        await db.timelineClip.update({
          where: { id: clip.id },
          data: { finalPrompt: recomputed.finalPrompt, promptVersion: recomputed.fingerprint },
        });
        reanchored = true;
        applied++;
      }

      const rerenderNeeded = promptState !== "up_to_date" || mediaVintage === "pre_discipline_render";
      if (rerenderNeeded) needRerender++;
      pEntry.clips.push({
        clipId: clip.id,
        order: clip.order,
        name: clip.name,
        status: clip.status,
        cameraMovement: clip.cameraMovement,
        styledCam: STYLED_CAMS.has(clip.cameraMovement ?? "") ? "受控技法（重渲染版自带限定词）" : null,
        shotSize: clip.shotSize,
        promptState,
        mediaVintage,
        mediaMtime,
        mediaUrl: clip.mediaUrl,
        reanchored,
        rerenderNeeded,
      });
    }
    manifest.projects.push(pEntry);
  }

  // —— 执行单：配额窗口打开后的逐镜重渲染 curl（只打印不执行） ——
  const plan = [];
  for (const p of manifest.projects) {
    for (const c of p.clips) {
      if (!c.rerenderNeeded) continue;
      plan.push({
        project: p.title,
        clip: c.name,
        clipId: c.clipId,
        command: `curl -s -X POST http://localhost:3000/api/projects/${p.projectId}/tasks -H 'Content-Type: application/json' -d '{"kind":"video","clipId":"${c.clipId}"}'`,
      });
    }
  }

  // 控制台摘要
  console.log("== 重渲染清单（零配额盘点，未触发任何生成） ==");
  for (const p of manifest.projects) {
    const n = p.clips.length;
    const stale = p.clips.filter((c) => c.promptState === "stale_anchor").length;
    const old = p.clips.filter((c) => c.mediaVintage === "pre_discipline_render").length;
    console.log(`  ${p.series}｜${p.title}：${n} 镜，锚点过期 ${stale}，旧渲染成片 ${old}`);
    for (const c of p.clips) {
      if (!c.rerenderNeeded) continue;
      console.log(`    · 镜${c.order + 1} ${c.name}｜${c.promptState}｜${c.mediaVintage}${c.styledCam ? "｜" + c.styledCam : ""}`);
    }
  }
  console.log(`\n合计：${total} 镜，待重渲染 ${needRerender} 镜${APPLY ? `，已重锚 ${applied} 镜（零生成）` : ""}`);

  // JSON 清单落盘（db/ 本机状态，gitignore 覆盖）
  const { writeFileSync } = await import("node:fs");
  const out = join(ROOT, "db", "rerender-manifest.json");
  writeFileSync(out, JSON.stringify({ ...manifest, plan }, null, 2));
  console.log(`清单已写入: ${out}`);
  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
