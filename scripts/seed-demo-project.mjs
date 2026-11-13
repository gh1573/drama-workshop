/**
 * 演示项目种子（零配额）：直接落 DB + 复用 public/assets 既有文件，
 * 用于工作台会话视图的视觉审计与截图回归。不调用任何外部通道。
 * 用法：bun scripts/seed-demo-project.mjs [--keep]
 *   （v2.9.4 起需 bun 运行：finalPrompt 由真组装器 composeVideoPrompt
 *    现算产出——演示数据与真实流水线提示词协议同源，禁止手写快照漂移）
 */
import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { composeVideoPrompt } from "../src/server/engines/prompt-engine";

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
    cameraMovement: "push",
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
    cameraMovement: "whip_pan",
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
    cameraMovement: "static_close",
    promptGuidance: "一镜到底环绕推近，结尾定格微笑特写，画面压黑收束",
    energyStart: 95,
    energyEnd: 78,
  },
];

const shotPlan = [
  // sub = 镜头台词（配音 + 烧录字幕的单一来源；空串 = 无台词静默镜头）。
  // 台词分布纪律（v2.9.1）：每幕至多一句有声台词，落点在叙事拍点；大特写静默处理更有张力；
  // 配音源文件 voice_demo_*.wav 已 ASR 回验与台词逐字一致（场记核对纪律）。
  /* v2.9.2 运镜协议规范化：cam 必须是 CAMERA_MOVEMENTS 池内键
     （push/whip_pan/static_close/pan_horizontal/handheld/low_angle_tracking/top_down/orbit…）。
     历史版本自造驼峰名（slowPushIn/craneDown/orbitRight…）不在池内，
     导致节奏页运镜多样性统计把 8 种算成 1 种——演示数据必须与
     真实流水线同协议（breakdown-service 拆镜协议零容错，种子同样零容错）。 */
  { beat: 1, name: "寿宴全景", shotSize: "远景", cam: "pan_horizontal", energy: 68, desc: "豪门寿宴大厅全景，水晶灯下宾客举杯寒暄，热闹表象下暗流涌动", sfx: "宴会环境音渐起", sub: "「陈锋，你连给我提鞋都不配——滚出林家！」", voice: "voice_demo_hook.wav", vp: "wide shot of a luxurious banquet hall, guests toasting under crystal chandeliers, festive surface with hidden tension, warm golden lighting" },
  { beat: 1, name: "撕婚书特写", shotSize: "特写", cam: "static_close", energy: 82, desc: "林晚秋纤手撕碎婚书，纸屑纷飞砸向镜头，慢镜中纸片如雪", sfx: "纸张撕裂声放大", vp: "close-up of elegant hands tearing a marriage document, paper scraps flying toward camera in slow motion, falling like snow, dramatic backlight" },
  { beat: 1, name: "泼汤羞辱", shotSize: "近景", cam: "handheld", energy: 88, desc: "菜汤泼在陈锋胸口，汤汁顺着衣襟滴落，周围宾客窃笑指点", sfx: "液体泼洒+窃笑声", vp: "soup splashed onto a man's chest, dripping down his dark robe, guests whispering and pointing around him, controlled handheld, shallow depth of field" },
  { beat: 1, name: "眼神转冷", shotSize: "大特写", cam: "push", energy: 90, desc: "陈锋垂眸的睫毛颤动，抬眼瞬间瞳孔里最后一点温度熄灭", sfx: "心跳低频渐强", vp: "extreme close-up of a man's eyes, trembling lashes then a slowly freezing gaze, last warmth fading from his pupils, low-key dramatic lighting" },
  { beat: 2, name: "大门轰开", shotSize: "全景", cam: "whip_pan", energy: 92, desc: "寿宴大门轰然洞开，逆光中玄甲卫士列阵涌入，宾客惊退", sfx: "金属破门轰鸣", vp: "grand banquet doors burst open with strong backlight, armored guards marching in formation, guests recoiling in shock, whip pan sweep, dramatic silhouettes" },
  { beat: 2, name: "统帅跪呈", shotSize: "中景", cam: "low_angle_tracking", energy: 96, desc: "为首统帅单膝跪地，双手呈上鎏金虎符，甲胄铿锵", sfx: "甲胄碰撞+闷雷", vp: "low angle of a veteran general kneeling on one knee, presenting a gilded tiger tally with both hands, black armor glinting, solemn hero shot" },
  { beat: 2, name: "万人齐呼", shotSize: "远景", cam: "top_down", energy: 100, desc: "俯拍大远景，门外将士单膝跪地齐呼龙王，声浪震彻云霄", sfx: "山呼海啸齐诵", sub: "「北境统帅陈锋，今日——清账。」", voice: "voice_demo_climax.wav", vp: "top-down wide shot, thousands of soldiers kneeling outside the gate roaring in unison, massive scale, epic overhead composition, dust and torch light" },
  { beat: 2, name: "酒杯坠地", shotSize: "特写", cam: "static_close", energy: 97, desc: "林晚秋指尖松开，高脚杯坠地炸裂，酒液溅上她的裙摆", sfx: "玻璃碎裂+死寂", vp: "close-up of a wine glass slipping from trembling fingers, shattering on the floor, red wine splashing onto her cream gown, frozen silence" },
  { beat: 3, name: "环视全场", shotSize: "中景", cam: "orbit", energy: 95, desc: "陈锋接过虎符却不看，缓缓起身环视满堂噤声的宾客", sfx: "衣料摩擦+静默", sub: "「三年前泼我冷水的账……今天，连本带利。」", voice: "voice_demo_cliffhanger.wav", vp: "slow orbiting medium shot of a man holding a tiger tally, calmly scanning the silenced banquet hall, confident and unhurried, cinematic tension" },
  { beat: 3, name: "意味深长一笑", shotSize: "大特写", cam: "push", energy: 92, desc: "陈锋弹去袖口汤渍，唇角缓缓勾起，眼底寒光一闪，画面压黑", sfx: "低频收束音", vp: "extreme close-up, a man brushing stains off his sleeve, corner of his mouth curling into a cold smile, glint of menace in his eyes, fade to black" },
];

/* 项目影调锚点：project.create 与每镜组装同源引用（禁两处字面量漂移） */
const PROJECT_TONE =
  "high-contrast dramatic cinema, intense confrontation, low angle hero shot, cinematic lighting, gold and obsidian tones, high tension facial micro-expressions";

async function main() {
  const keep = process.argv.includes("--keep");
  if (!keep) {
    await db.project.deleteMany({ where: { title: { contains: "演示" } } });
  }

  /* v2.9.2：演示项目直接建为系列第 1 集（对齐连载生产线叙事）——
     历史版本只建独立项目，系列归属依赖后续 next-episode 自动 adopt，
     重播种后项目库系列分组/信息卡连载徽标全部消失，验证脚本前置也随之失效 */
  const series =
    (await db.series.findFirst({ where: { title: "战神逆袭" } })) ??
    (await db.series.create({
      data: {
        title: "战神逆袭",
        synopsis: "赘婿战神打脸逆袭系列：三年隐忍，一朝亮剑",
        genreId: "shuangwen",
        genreName: "战神逆袭 · 龙王归来",
        genreBadge: "高燃打脸 · 爽感爆棚",
      },
    }));

  const project = await db.project.create({
    data: {
      title: "战神逆袭 · 演示第一集",
      seriesId: series.id,
      episodeNo: 1,
      // v2.9.11：种子项目成片已合成（finalVideoUrl 已回填）——交付状态语义
      status: "delivered",
      genreId: "shuangwen",
      genreName: "战神逆袭 · 龙王归来",
      genreBadge: "高燃打脸 · 爽感爆棚",
      hookTactic: "0~3s 冲突爆发：撕毁婚书当众羞辱，主角眼神冰冷，身份信物若隐若现",
      musicMood: "重低音震荡战鼓、霸气交响乐渐强、金属拔剑音效",
      tonePrompt: PROJECT_TONE,
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

  const refPlan = [
    [0, 3, 4], [0, 1, 3, 4], [0, 1, 3, 4], [0, 3, 4],
    [2, 3, 4], [2, 3, 4], [2, 3, 4], [1, 3],
    [0, 3, 4], [0, 3],
  ];
  /* 状态注记：只用 STATE_NOTE_PROMPTS 词表词（确定性翻译），且挂对对象——
   * 历史版本「衣襟汤渍」自造词挂在晚秋身上，实际汤泼在陈锋身上 */
  const shotStates = { 2: { 0: "衣冠不整" } };
  const clips = [];
  for (let i = 0; i < shotPlan.length; i++) {
    const s = shotPlan[i];
    const ready = i < shotPlan.length - 1; // 最后一镜留 pending，验证「待出片」状态
    /* v2.9.4：finalPrompt 由真组装器 composeVideoPrompt 现算（与真实流水线
     * run-service 同一条代码路径），promptVersion 落锚点指纹——历史版本
     * 手写快照（旧一段式格式 + promptVersion 填版本号格式串）两处协议漂移 */
    const refs = (refPlan[i] ?? []).map((ai) => ({
      idx: ai,
      asset: assets[ai],
    }));
    const characters = refs
      .filter((r) => r.asset.kind === "character")
      .map((r) => ({
        name: r.asset.name,
        visualAnchor: r.asset.visualAnchor,
        stateNote: shotStates[i]?.[r.idx] ?? null,
      }));
    const sceneRef = refs.find((r) => r.asset.kind === "scene") ?? null;
    const { finalPrompt, fingerprint } = composeVideoPrompt({
      shot: {
        visualDesc: s.desc,
        visualPrompt: s.vp,
        cameraMovement: s.cam,
        shotSize: s.shotSize,
      },
      characters,
      scene: sceneRef
        ? {
            name: sceneRef.asset.name,
            visualAnchor: sceneRef.asset.visualAnchor,
            stateNote: shotStates[i]?.[sceneRef.idx] ?? null,
          }
        : null,
      props: refs
        .filter((r) => r.asset.kind === "prop")
        .map((r) => ({
          name: r.asset.name,
          visualAnchor: r.asset.visualAnchor,
          stateNote: shotStates[i]?.[r.idx] ?? null,
        })),
      tonePrompt: PROJECT_TONE,
      aspectRatio: "9:16",
      plannedMs: 5000,
      resolution: "1080p",
    });
    clips.push(
      await db.timelineClip.create({
        data: {
          projectId: project.id,
          beatIndex: s.beat,
          order: i,
          name: `${s.beat}-${i + 1} ${s.name}`,
          subtitle: s.sub ?? "",
          format: "mp4",
          status: ready ? "ready" : "pending",
          mediaUrl: ready ? V(i) : null,
          durationMs: ready ? 5000 : null,
          shotSize: s.shotSize,
          cameraMovement: s.cam,
          visualDesc: s.desc,
          visualPrompt: s.vp,
          plannedMs: 5000,
          finalPrompt,
          promptVersion: fingerprint,
          energy: s.energy,
          sfxHint: s.sfx,
        },
      })
    );
  }

  // 镜头 ↔ 资产引用（v2.9.4 修正：场景全勤——历史版本前 4 镜漏挂宴会厅，
  // 组装出的 finalPrompt 缺 [SCENE] 段一致性锚定失效；镜 8「酒杯坠地」去错挂
  // 的虎符——画面里只有酒杯）。资产序：0 陈锋 / 1 晚秋 / 2 统帅 / 3 寿宴大厅 / 4 虎符
  for (let i = 0; i < refPlan.length; i++) {
    for (const ai of refPlan[i]) {
      await db.shotRef.create({
        data: { shotId: clips[i].id, assetId: assets[ai].id, stateNote: shotStates[i]?.[ai] ?? null },
      });
    }
  }

  // 轨道：字幕 + 音效 + 配音（v2.9.1：配音链路真实化——拷贝已回验的演示配音到
  // voice_{clipId}.wav 并落 voiceover 轨，镜像 dispatcher 回写协议，零配额）
  let cursor = 0;
  for (let i = 0; i < shotPlan.length; i++) {
    const s = shotPlan[i];
    const startMs = cursor;
    const endMs = cursor + 5000;
    cursor += 5000;
    if (s.sfx) {
      await db.trackItem.create({
        data: {
          projectId: project.id,
          kind: "sfx",
          clipId: clips[i].id,
          startMs,
          endMs,
          text: s.sfx,
        },
      });
    }
    if (s.sub) {
      await db.trackItem.create({
        data: {
          projectId: project.id,
          kind: "subtitle",
          clipId: clips[i].id,
          startMs: startMs + 600,
          endMs: endMs - 400,
          text: s.sub,
        },
      });
    }
    if (s.voice) {
      const src = join(ASSETS, s.voice);
      if (existsSync(src)) {
        const file = `voice_${clips[i].id}.wav`;
        copyFileSync(src, join(ASSETS, file));
        await db.trackItem.create({
          data: {
            projectId: project.id,
            kind: "voiceover",
            clipId: clips[i].id,
            startMs,
            endMs,
            text: s.sub,
            style: JSON.stringify({ url: `/assets/${file}` }),
          },
        });
      }
    }
  }
  await db.trackItem.create({
    data: { projectId: project.id, kind: "bgm", clipId: null, startMs: 0, endMs: 50000, text: "战鼓渐强" },
  });

  // 已成功的制作运行（含剧组日志，形状对齐 run-service：{ at, role, message }）
  const journal = [
    { at: new Date(Date.now() - 40 * 60000).toISOString(), role: "producer", message: "项目《战神逆袭 · 演示第一集》正式开机 🎬 题材战术手册已下发全组" },
    { at: new Date(Date.now() - 38 * 60000).toISOString(), role: "screenwriter", message: "场次推演完成：hook「婚书碎地」/ climax「统帅破门」/ cliffhanger「旧账新算」" },
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
        { key: "screenwriting", status: "succeeded", note: "场次剧本就绪" },
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
