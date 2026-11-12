/**
 * 摄影专业规范验证（v2.8.2）：运镜 = 运动语义 + 执行设备 + 受控度。
 *
 * 验证哲学：要排除的是「意外抖动」，不是「有意图的运镜」——
 * 手持/甩镜/荷兰倾斜是正当电影技法，必须保留专业语义，但需满足：
 * 1. 每个机位 prompt 必须声明执行设备（dolly/crane/steadicam/tripod…）
 *    或受控限定（controlled/precise/intentional）；
 * 2. 风格化机位（handheld/whip_pan/dutch_tilt）必须带受控限定词；
 * 3. 「handheld」一词只允许出现在 handheld 机位（风格化选择不外溢）；
 * 4. 池首位（回退默认位）必须是通用稳定机位（设备执行类）；
 * 5. 景别必须完成中文→英文电影术语映射，最终提示词不得残留中文景别；
 * 6. 全局技术尾巴含 intentional camera movement（不与风格化机位打架）。
 */
import {
  CAMERA_MOVEMENTS,
  ACT_MOVEMENT_POOLS,
  SHOT_SIZES,
  SHOT_SIZE_PROMPTS,
} from "../src/lib/drama";
import { PROMPT_TECHNICAL_TAIL } from "../src/config/templates";
import { composeVideoPrompt } from "../src/server/engines/prompt-engine";

const DEVICE_WORDS = ["dolly", "crane", "jib", "steadicam", "gimbal", "tripod", "locked-off"];
const CONTROL_WORDS = ["controlled", "precise", "intentional", "subtle"];
/** 风格化机位 → 必须命中的受控限定词 */
const STYLED_REQUIREMENTS: Record<string, string[]> = {
  handheld: ["controlled", "subtle"],
  whip_pan: ["precise", "controlled"],
  dutch_tilt: ["intentional", "steady"],
};

let fail = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    fail++;
    console.error("  [FAIL]", msg);
  }
};

// 1) 运镜库：设备/受控词审计
console.log("== 1) CAMERA_MOVEMENTS 摄影专业词表审计 ==");
for (const [key, mv] of Object.entries(CAMERA_MOVEMENTS)) {
  const p = mv.prompt.toLowerCase();
  const hasDevice = DEVICE_WORDS.some((w) => p.includes(w));
  const hasControl = CONTROL_WORDS.some((w) => p.includes(w));
  check(hasDevice || hasControl, `${key} 既无执行设备也无受控限定: ${mv.prompt}`);

  const styled = STYLED_REQUIREMENTS[key];
  if (styled) {
    for (const w of styled) {
      check(p.includes(w), `${key}（风格化机位）缺受控限定词 "${w}": ${mv.prompt}`);
    }
  } else {
    // 非手持类机位不得出现 handheld 一词（风格化选择不外溢）
    check(!p.includes("handheld"), `${key} 非手持机位出现了 handheld: ${mv.prompt}`);
  }
  console.log(`  ${key.padEnd(18)} ${mv.label.padEnd(7)} ${mv.prompt}`);
}

// 2) 池首位 = 通用稳定回退位（设备执行类，且非风格化机位）
console.log("\n== 2) ACT_MOVEMENT_POOLS 回退默认位审计 ==");
for (const [fn, pool] of Object.entries(ACT_MOVEMENT_POOLS)) {
  const first = pool[0];
  check(!(first in STYLED_REQUIREMENTS), `${fn} 池首位 ${first} 是风格化机位，不能做回退默认`);
  const p = CAMERA_MOVEMENTS[first]?.prompt.toLowerCase() ?? "";
  check(DEVICE_WORDS.some((w) => p.includes(w)), `${fn} 池首位 ${first} 非设备执行机位`);
  for (const k of pool) check(k in CAMERA_MOVEMENTS, `${fn} 池含未知运镜 key: ${k}`);
  console.log(`  ${fn.padEnd(12)} pool[0]=${first.padEnd(16)} ${pool.join(" / ")}`);
}

// 3) 景别映射完备性
console.log("\n== 3) SHOT_SIZE_PROMPTS 景别英文映射审计 ==");
for (const size of SHOT_SIZES) {
  const en = SHOT_SIZE_PROMPTS[size];
  check(!!en && /^[a-z][a-z\s-]*$/.test(en), `景别「${size}」缺英文映射或非纯英文: ${en}`);
  console.log(`  ${size} → ${en}`);
}
check(Object.keys(SHOT_SIZE_PROMPTS).length === SHOT_SIZES.length, "景别映射表与景别库数量不一致");

// 4) 端到端合成：全运镜 × 全景别抽样，验证最终提示词
console.log("\n== 4) composeVideoPrompt 端到端审计 ==");
let n = 0;
for (const key of Object.keys(CAMERA_MOVEMENTS)) {
  for (const size of SHOT_SIZES.slice(0, 3)) {
    const out = composeVideoPrompt({
      shot: {
        visualDesc: "宴会厅内众人回头，水晶吊灯光斑洒在红毯上",
        visualPrompt: "crowd turns back in shock inside banquet hall, crystal chandelier light on red carpet",
        cameraMovement: key,
        shotSize: size,
        subtitle: "你敢再说一遍？",
      },
      characters: [{ name: "陈锋", visualAnchor: "Chinese male in his 30s, sharp suit" }],
      scene: { name: "宴会厅", visualAnchor: "luxury banquet hall, golden ambient light" },
      props: [{ name: "黑卡", visualAnchor: "matte black metal card" }],
      tonePrompt: "cinematic drama, high contrast lighting",
      aspectRatio: "9:16",
      plannedMs: 4500,
      resolution: "1080P",
    });
    n++;
    // 技术段必须是英文电影术语（无中文景别残留）
    const cjk = out.segments.technical.match(/[\u4e00-\u9fff]/);
    check(!cjk, `[${key}/${size}] 技术段残留中文: ${out.segments.technical}`);
    check(
      out.segments.technical.includes(`${SHOT_SIZE_PROMPTS[size]} framing`),
      `[${key}/${size}] 技术段未命中景别英文映射`
    );
    check(
      out.finalPrompt.includes(PROMPT_TECHNICAL_TAIL),
      `[${key}/${size}] 全局技术尾巴缺失`
    );
  }
}
console.log(`  共审计 ${n} 条最终提示词`);

// 5) 风格化机位样例输出
console.log("\n== 5) 风格化机位最终提示词样例 ==");
for (const key of ["handheld", "whip_pan", "dutch_tilt", "push"]) {
  const out = composeVideoPrompt({
    shot: {
      visualDesc: "陈锋攥紧拳头逼近一步",
      visualPrompt: "Chen Feng clenches fist and steps closer",
      cameraMovement: key,
      shotSize: "特写",
      subtitle: "",
    },
    characters: [{ name: "陈锋", visualAnchor: "Chinese male in his 30s, sharp suit" }],
    scene: null,
    props: [],
    tonePrompt: "cinematic drama",
    aspectRatio: "9:16",
    plannedMs: 4000,
    resolution: "1080P",
  });
  console.log(`  [${key}]\n    ${out.finalPrompt}\n`);
}

// 6) 全局技术尾巴
console.log("== 6) PROMPT_TECHNICAL_TAIL ==");
console.log(`  "${PROMPT_TECHNICAL_TAIL}"`);
check(
  PROMPT_TECHNICAL_TAIL.includes("intentional camera movement"),
  "技术尾巴缺 intentional camera movement（专业运镜纪律核心词）"
);

console.log(
  fail === 0
    ? "\n✅ 全部通过：运镜专业语义保留 + 执行设备声明 + 受控限定 + 景别英文映射"
    : `\n❌ ${fail} 项未通过`
);
process.exit(fail === 0 ? 0 : 1);
