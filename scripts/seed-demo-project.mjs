/**
 * 演示项目种子（零配额）：直接落 DB + 复用 public/assets 既有文件，
 * 用于工作台会话视图的视觉审计与截图回归。不调用任何外部通道。
 * 用法：node scripts/seed-demo-project.mjs [--keep]
 */
import { PrismaClient } from "@prisma/client";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "public", "assets");
const db = new PrismaClient();

const pngs = readdirSync(ASSETS).filter((f) => f.startsWith("asset_") && f.endsWith(".png"));
const mp4s = readdirSync(ASSETS).filter((f) => f.startsWith("clip_") && f.endsWith(".mp4"));
const wavs = readdirSync(ASSETS).filter((f) => f.startsWith("voice_") && f.endsWith(".wav"));
const finals = readdirSync(ASSETS).filter((f) => f.startsWith("final_") && f.endsWith(".mp4"));

if (pngs.length < 6 || mp4s.length < 10) {
  console.error("资产文件不足，终止：", { pngs: pngs.length, mp4s: mp4s.length });
  process.exit(1);
}

const A = (i) => `/assets/${pngs[i % pngs.length]}`;
const V = (i) => `/assets/${mp4s[i % mp4s.length]}`;
const W = (i) => `/assets/${wavs[i % wavs.length]}`;
const F = () => `/assets/${finals[0] ?? mp4s[0]}`;

const beats = [
  {
    index: 1,
    actTitle: "婚书碎地",
    narrativeFunction: "hook",
    pacingNote: "3 秒内冲突爆开，羞辱动作直接给足，不给铺垫",
    description:
      "豪门寿宴大厅，宾客觥筹交错。林晚秋当众撕碎婚书砸在陈锋脸上，菜汤泼洒，全场哗然。陈锋低着头，指尖捏紧半张碎纸，眼神一点点冷下来。",
    dialogueSubtitle: "「陈锋，你连给我提鞋都不配——滚出林家！」",
    cameraMovement: "slowPushIn",
    promptGuidance: "开场即冲突顶点，逆光剪藏主角面部情绪，特写碎纸落地的慢镜",
    energyStart: 72,
    energyEnd: 88,
  },
  {
    index: 2,
    actTitle: "统帅破门",
    narrativeFunction: "climax",
    pacingNote: "反转瞬时引爆，节奏拉满，万人齐跪的排面一次给足",
    description:
      "寿宴大门轰然洞开，玄甲卫士列阵涌入。为首统帅单膝跪地呈上虎符，十万将士山呼海啸。林晚秋手中的酒杯坠地粉碎，全场死寂。",
    dialogueSubtitle: "「北境统帅陈锋，今日——清账。」",
    cameraMovement: "whipPan",
    promptGuidance: "大门破光切入，跪拜用大远景俯拍，反打林晚秋僵住的面部大特写",
    energyStart: 88,
    energyEnd: 100,
  },
  {
    index: 3,
    actTitle: "旧账新算",
    narrativeFunction: "cliffhanger",
    pacingNote: "留钩卡点，最后一镜定格主角意味深长的微笑",
    description:
      "陈锋接过虎符却不看它，只是缓缓抬眼扫过满堂宾客，最后停在脸色惨白的林晚秋身上。他弹了弹袖口的汤渍，唇角勾起。",
    dialogueSubtitle: "「三年前泼我冷水的账……今天，连本带利。」",
    cameraMovement: "static",
    promptGuidance: "一镜到底环绕推近，结尾定格微笑特写，画面压黑收束",
    energyStart: 95,
    energyEnd: 78,
  },
];

const shotPlan = [
  { beat: 1, name: "寿宴全景", shotSize: "远景", cam: "craneDown", energy: 68, desc: "豪门寿宴大厅全景，水晶灯下宾客举杯寒暄，热闹表象下暗流涌动", sfx: "宴会环境音渐起" },
  { beat: 1, name: "撕婚书特写", shotSize: "特写", cam: "static", energy: 82, desc: "林晚秋纤手撕碎婚书，纸屑纷飞砸向镜头，慢镜中纸片如雪", sfx: "纸张撕裂声放大" },
  { beat: 1, name: "泼汤羞辱", shotSize: "近景", cam: "handheld", energy: 88, desc: "菜汤泼在陈锋胸口，汤汁顺着衣襟滴落，周围宾客窃笑指点", sfx: "液体泼洒+窃笑声" },
  { beat: 1, name: "眼神转冷", shotSize: "大特写", cam: "slowPushIn", energy: 90, desc: "陈锋垂眸的睫毛颤动，抬眼瞬间瞳孔里最后一点温度熄灭", sfx: "心跳低频渐强" },
  { beat: 2, name: "大门轰开", shotSize: "全景", cam: "whipPan", energy: 92, desc: "寿宴大门轰然洞开，逆光中玄甲卫士列阵涌入，宾客惊退", sfx: "金属破门轰鸣" },
  { beat: 2, name: "统帅跪呈", shotSize: "中景", cam: "dollyIn", energy: 96, desc: "为首统帅单膝跪地，双手呈上鎏金虎符，甲胄铿锵", sfx: "甲胄碰撞+闷雷" },
  { beat: 2, name: "万人齐呼", shotSize: "远景", cam: "craneUp", energy: 100, desc: "俯拍大远景，门外将士单膝跪地齐呼龙王，声浪震彻云霄", sfx: "山呼海啸齐诵" },
  { beat: 2, name: "酒杯坠地", shotSize: "特写", cam: "static", energy: 97, desc: "林晚秋指尖松开，高脚杯坠地炸裂，酒液溅上她的裙摆", sfx: "玻璃碎裂+死寂" },
  { beat: 3, name: "环视全场", shotSize: "中景", cam: "orbitRight", energy: 95, desc: "陈锋接过虎符却不看，缓缓起身环视满堂噤声的宾客", sfx: "衣料摩擦+静默" },
  { beat: 3, name: "意味深长一笑", shotSize: "大特写", cam: "slowPushIn", energy: 92, desc: "陈锋弹去袖口汤渍，唇角缓缓勾起，眼底寒光一闪，画面压黑", sfx: "低频收束音" },
];

async function main() {
  const keep = process.argv.includes("--keep");
  if (!keep) {
    await db.project.deleteMany({ where: { title: { contains: "演示" } } });
  }

  const project = await db.project.create({
    data: {
      title: "战神逆袭 · 演示第一集",
      status: "inProduction",
      genreId: "shuangwen",
      genreName: "战神逆袭 · 龙王归来",
      genreBadge: "高燃打脸 · 爽感爆棚",
      hookTactic: "0~3s 冲突爆发：撕毁婚书当众羞辱，主角眼神冰冷，身份信物若隐若现",
      musicMood: "重低音震荡战鼓、霸气交响乐渐强、金属拔剑音效",
      tonePrompt:
        "high-contrast dramatic cinema, intense confrontation, low angle hero shot, cinematic lighting, gold and obsidian tones, high tension facial micro-expressions",
      synopsis:
        "赘婿隐忍三年受尽欺凌，反派当众撕碎婚书泼菜汤；主角冷笑亮出信物，顶级统帅带十万将士破门而入跪地齐呼龙王！",
      videoModel: "Omni 1.2 Flash",
      durationSeconds: 5,
      resolution: "1080p",
      thinkingLevel: "low",
      promptEnhance: true,
      finalVideoUrl: F(),
      transitionMode: "auto",
      gradePreset: "shuangwen",
      beats: { create: beats },
    },
  });

  const chars = [
    {
      kind: "character",
      name: "陈锋",
      lockedAppearance: "华人男性，30 岁，剑眉星目，身姿挺拔，玄色立领长衫",
      visualAnchor:
        "East Asian male, 30s, sharp eyebrows, cold piercing eyes, tall upright posture, black mandarin-collar robe",
      voiceProfile: "低沉磁性的青年男声，克制的怒意",
      portraitUrl: A(0),
    },
    {
      kind: "character",
      name: "林晚秋",
      lockedAppearance: "华人女性，27 岁，精致红唇，米色礼服裙，高傲神态",
      visualAnchor:
        "East Asian female, late 20s, red lips, cream evening gown, arrogant demeanor, delicate features",
      voiceProfile: "尖利的女声，居高临下",
      portraitUrl: A(1),
    },
    {
      kind: "character",
      name: "玄甲统帅",
      lockedAppearance: "华人男性，45 岁，络腮短须，玄色铠甲，虎背熊腰",
      visualAnchor:
        "East Asian male, 45, short beard, black lacquered armor, broad shoulders, battle-worn face",
      voiceProfile: "浑厚的中年男声，洪亮",
      portraitUrl: A(2),
    },
    {
      kind: "scene",
      name: "林氏寿宴大厅",
      lockedAppearance: "中式豪门宴会厅，双层挑高，水晶吊灯，红金主色，雕龙立柱",
      visualAnchor:
        "Chinese magnate banquet hall, double-height ceiling, crystal chandeliers, red and gold palette, carved dragon pillars",
      portraitUrl: A(3),
    },
    {
      kind: "prop",
      name: "鎏金虎符",
      lockedAppearance: "鎏金虎形兵符，兽首衔环，云纹錾刻，覆红绸托盘",
      visualAnchor:
        "gilded bronze tiger tally, beast head holding a ring, engraved cloud patterns, on red silk tray",
      portraitUrl: A(4),
    },
  ];
  const assets = [];
  for (const c of chars) {
    assets.push(await db.asset.create({ data: { ...c, projectId: project.id, source: "crew" } }));
  }

  const clips = [];
  for (let i = 0; i < shotPlan.length; i++) {
    const s = shotPlan[i];
    const ready = i < shotPlan.length - 1; // 最后一镜留 pending，验证「待出片」状态
    clips.push(
      await db.timelineClip.create({
        data: {
          projectId: project.id,
          beatIndex: s.beat,
          order: i,
          name: `${s.beat}-${i + 1} ${s.name}`,
          subtitle: i % 3 === 0 ? beats[s.beat - 1].dialogueSubtitle : "",
          format: "mp4",
          status: ready ? "ready" : "pending",
          mediaUrl: ready ? V(i) : null,
          durationMs: ready ? 5000 : null,
          shotSize: s.shotSize,
          cameraMovement: s.cam,
          visualDesc: s.desc,
          visualPrompt:
            "slow motion paper scraps falling, dramatic backlight, shallow depth of field, cinematic tension",
          plannedMs: 5000,
          finalPrompt:
            "East Asian male, 30s, sharp eyebrows, cold piercing eyes — slow motion paper scraps falling, dramatic backlight, cinematic tension, high-contrast dramatic cinema, low angle hero shot",
          promptVersion: "anchor-v2",
          energy: s.energy,
          sfxHint: s.sfx,
        },
      })
    );
  }

  // 镜头 ↔ 资产引用（陈锋全勤，晚秋前 4 镜，统帅第 5-8 镜，场景全勤）
  const refPlan = [
    [0, 4], [0, 1, 4], [0, 1, 4], [0, 4],
    [2, 4], [2, 3, 4], [2, 3, 4], [1, 3, 4],
    [0, 3, 4], [0, 3],
  ];
  for (let i = 0; i < refPlan.length; i++) {
    for (const ai of refPlan[i]) {
      await db.shotRef.create({
        data: { shotId: clips[i].id, assetId: assets[ai].id, stateNote: i === 2 ? "衣襟汤渍" : null },
      });
    }
  }

  // 轨道：字幕 + 音效
  for (let i = 0; i < shotPlan.length; i++) {
    if (shotPlan[i].sfx) {
      await db.trackItem.create({
        data: {
          projectId: project.id,
          kind: "sfx",
          clipId: clips[i].id,
          startMs: i * 5000,
          endMs: i * 5000 + 5000,
          text: shotPlan[i].sfx,
        },
      });
    }
  }
  await db.trackItem.create({
    data: { projectId: project.id, kind: "bgm", clipId: null, startMs: 0, endMs: 50000, text: "战鼓渐强" },
  });

  // 已成功的制作运行（含剧组日志，形状对齐 run-service：{ at, role, message }）
  const journal = [
    { at: new Date(Date.now() - 40 * 60000).toISOString(), role: "producer", message: "项目《战神逆袭 · 演示第一集》正式开机 🎬 题材战术手册已下发全组" },
    { at: new Date(Date.now() - 38 * 60000).toISOString(), role: "screenwriter", message: "三幕推演完成：hook「婚书碎地」/ climax「统帅破门」/ cliffhanger「旧账新算」" },
    { at: new Date(Date.now() - 32 * 60000).toISOString(), role: "casting", message: "5 项资产定妆完成（3 角色 / 1 场景 / 1 道具），华人面孔校验全部通过" },
    { at: new Date(Date.now() - 25 * 60000).toISOString(), role: "director", message: "10 镜拆解完成，能量曲线 68→100→92，运镜多样性 8 式" },
    { at: new Date(Date.now() - 18 * 60000).toISOString(), role: "supervisor", message: "10/10 镜头锚点组装完成，提示词指纹全部最新" },
    { at: new Date(Date.now() - 8 * 60000).toISOString(), role: "post", message: "后期成包完成：字幕烧录 / 音效卡点 / 配音混音 / 成片合成" },
  ];
  await db.productionRun.create({
    data: {
      projectId: project.id,
      status: "succeeded",
      progress: 100,
      stage: "postproduction",
      stages: JSON.stringify([
        { key: "screenwriting", status: "succeeded", note: "三幕剧本就绪" },
        { key: "casting", status: "succeeded", note: "5 资产定妆" },
        { key: "directing", status: "succeeded", note: "10 镜拆解" },
        { key: "anchoring", status: "succeeded", note: "锚点组装完成" },
        { key: "postproduction", status: "succeeded", note: "成片就绪" },
      ]),
      journal: JSON.stringify(journal),
    },
  });

  // 渲染任务记录（含一条配音成功示例）
  for (const kind of ["portrait", "video", "voiceover"]) {
    await db.renderTask.create({
      data: {
        projectId: project.id,
        kind,
        status: "succeeded",
        payload: JSON.stringify({ demo: true }),
        resultUrl: kind === "voiceover" ? W(0) : kind === "portrait" ? A(5) : V(3),
        attempts: 1,
        maxAttempts: 2,
      },
    });
  }

  console.log("演示项目已创建:", project.id);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
