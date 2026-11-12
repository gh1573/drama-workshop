/**
 * 种子协议验证（v2.9.4）：演示数据必须与真实流水线提示词协议同源。
 *
 * 验证哲学：种子不是「好看的假数据」，而是产品协议的活标本——
 * 它经同一台组装器（composeVideoPrompt）现算 finalPrompt，因此
 * 每一项协议纪律都可以对 DB 快照做逐字节断言：
 * 1. 10 镜 finalPrompt 全部非空，promptVersion 为 12 位十六进制锚点指纹；
 * 2. 同源复算：用 DB 字段重新调用组装器，输出与 DB 快照逐字节一致；
 * 3. 分段语言纪律：Characters/Scene/Props/Camera/Style/Technical 六段
 *    零中文字符；Action 段取 visualPrompt（英文动作句）同样零中文；
 * 4. 台词零入画：subtitle 永不进 finalPrompt（TTS 配音 + 字幕烧录各归其位）；
 * 5. 场景全勤：10 镜全部含 [Scene] 段（一致性锚定不缺位）；
 * 6. 状态注记挂对对象：汤渍在陈锋不在晚秋，且命中 STATE_NOTE_PROMPTS
 *    确定性翻译（「衣冠不整」→ clothes stained and disheveled）；
 * 7. 道具去错挂修正：「酒杯坠地」镜画面里只有酒杯，无虎符锚点；
 * 8. 景别映射落地：Technical 段含英文 framing 术语、零中文景别残留。
 *
 * 用法：bun scripts/verify-seed-protocol.mjs
 */
import { PrismaClient } from "@prisma/client";
import { composeVideoPrompt } from "../src/server/engines/prompt-engine";

const db = new PrismaClient();
const CN = /[\u4e00-\u9fff]/;
let fail = 0;
let pass = 0;
const check = (ok, msg) => {
  if (ok) {
    pass++;
    console.log("PASS", msg);
  } else {
    fail++;
    console.error("FAIL", msg);
  }
};

async function main() {
  const project = await db.project.findFirst({
    where: { title: "战神逆袭 · 演示第一集" },
    include: { beats: true },
  });
  check(!!project, "演示项目存在");
  if (!project) process.exit(1);
  check(!!project.seriesId && project.episodeNo === 1, "系列第 1 集身份（seriesId + episodeNo=1）");

  const clips = await db.timelineClip.findMany({
    where: { projectId: project.id },
    orderBy: { order: "asc" },
    include: {
      refs: { include: { asset: true } },
    },
  });
  check(clips.length === 10, `镜头数 = 10（实际 ${clips.length}）`);

  const assets = await db.asset.findMany({ where: { projectId: project.id } });
  check(assets.length === 5, `资产数 = 5（实际 ${assets.length}）`);

  const CHEN = assets.find((a) => a.kind === "character" && a.name === "陈锋");
  const WAN = assets.find((a) => a.kind === "character" && a.name === "林晚秋");
  const HALL = assets.find((a) => a.kind === "scene");
  const TALLY = assets.find((a) => a.kind === "prop");
  check(!!CHEN && !!WAN && !!HALL && !!TALLY, "资产集齐：陈锋/林晚秋/寿宴大厅/鎏金虎符");

  for (const clip of clips) {
    const i = clip.order;
    const tag = `镜${i + 1}(${clip.name.replace(/^\d+-\d+\s*/, "")})`;

    // 1) finalPrompt 非空 + 指纹格式
    check(!!clip.finalPrompt?.trim(), `${tag} finalPrompt 非空`);
    check(
      /^[0-9a-f]{12}$/.test(clip.promptVersion ?? ""),
      `${tag} promptVersion = 12 位锚点指纹（实际 ${clip.promptVersion ?? "null"}）`
    );

    // 2) 同源复算：DB 字段 → 组装器 → 与快照逐字节一致
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
      tonePrompt: project.tonePrompt,
      aspectRatio: "9:16",
      plannedMs: clip.plannedMs,
      resolution: project.resolution,
    });
    check(
      recomputed.finalPrompt === clip.finalPrompt,
      `${tag} 同源复算逐字节一致（DB 快照 = 组装器现算）`
    );
    check(recomputed.fingerprint === clip.promptVersion, `${tag} 锚点指纹一致`);

    // 3) 分段语言纪律：六段 + Action 段零中文
    const segs = recomputed.segments;
    const cnIn = (s, label) => CN.test(s ?? "") ? `${label}段含中文` : null;
    const offenders = [
      cnIn(segs.characters, "Characters"),
      cnIn(segs.scene, "Scene"),
      cnIn(segs.props, "Props"),
      cnIn(segs.action, "Action"),
      cnIn(segs.camera, "Camera"),
      cnIn(segs.tone, "Style"),
      cnIn(segs.technical, "Technical"),
    ].filter(Boolean);
    check(offenders.length === 0, `${tag} 七段零中文${offenders.length ? "：" + offenders.join("；") : ""}`);

    // Action 段必须是英文 visualPrompt（而非中文降级）
    check(
      !!clip.visualPrompt && segs.action === clip.visualPrompt.trim(),
      `${tag} Action 段 = 英文 visualPrompt（非中文降级）`
    );

    // 4) 台词零入画
    check(
      !clip.subtitle || !clip.finalPrompt.includes(clip.subtitle),
      `${tag} 台词不入画面提示词`
    );

    // 5) 场景全勤
    check(segs.scene.trim().length > 0, `${tag} [Scene] 段全勤（一致性锚定不缺位）`);

    // 7) 道具去错挂修正：镜 8（order 7 酒杯坠地）无虎符
    if (i === 7) {
      check(
        !segs.props.includes(TALLY.visualAnchor),
        `${tag} 「酒杯坠地」无虎符锚点（去错挂）`
      );
      check(segs.scene.includes(HALL.visualAnchor), `${tag} 场景为寿宴大厅`);
    }

    // 6) 状态注记挂对对象：镜 3（order 2 泼汤羞辱）
    if (i === 2) {
      const chenRef = clip.refs.find((r) => r.assetId === CHEN.id);
      const wanRef = clip.refs.find((r) => r.assetId === WAN.id);
      check(chenRef?.stateNote === "衣冠不整", `${tag} 陈锋挂「衣冠不整」（汤泼在陈锋身上）`);
      check(!wanRef?.stateNote, `${tag} 林晚秋无状态注记（不背别人的汤）`);
      check(
        segs.characters.includes("clothes stained and disheveled") &&
          segs.characters.includes(CHEN.visualAnchor),
        `${tag} 状态注记确定性翻译进 Characters 段`
      );
    }

    // 8) 景别映射落地：Technical 段含 framing 术语且零中文景别
    check(/\bframing\b/.test(segs.technical), `${tag} Technical 段含英文 framing 术语`);
  }

  // 台词分布纪律抽查：3 句台词，每幕至多 1 句
  const withSub = clips.filter((c) => c.subtitle?.trim());
  check(withSub.length === 3, `台词镜数 = 3（实际 ${withSub.length}）`);
  const beatSubCount = new Map();
  for (const c of withSub) beatSubCount.set(c.beatIndex, (beatSubCount.get(c.beatIndex) ?? 0) + 1);
  check(
    [...beatSubCount.values()].every((n) => n <= 1),
    "每幕至多 1 句有声台词（台词落点纪律）"
  );

  console.log(`\n断言: ${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
