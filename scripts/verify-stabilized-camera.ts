/**
 * 防抖修复验证：composeVideoPrompt 全运镜输出审计
 * 检查项：
 * 1. 12 个运镜 key 全部可解析（旧项目数据兼容）
 * 2. 最终提示词不含晃动词（handheld/shaky/whip/destabilized/off-kilter/lightning-fast）
 * 3. 每条最终提示词都带稳定器词汇（smooth/steady/stabilized/gimbal/steadicam/locked）
 * 4. 技术段全局兜底存在
 */
import { CAMERA_MOVEMENTS, ACT_MOVEMENT_POOLS } from "../src/lib/drama";
import { PROMPT_TECHNICAL_TAIL } from "../src/config/templates";
import { composeVideoPrompt } from "../src/server/engines/prompt-engine";

const SHAKE_WORDS = ["handheld", "shaky", "whip pan", "destabilized", "off-kilter", "lightning-fast", "camera swing"];
const STABLE_WORDS = ["smooth", "steady", "stabilized", "gimbal", "steadicam", "locked-off", "locked steady"];
const MOVEMENT_PROMPT_STABLE = ["smooth", "steady", "stabilized", "gimbal", "steadicam", "locked"];

let fail = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) { fail++; console.error("  [FAIL]", msg); }
};

// 1) 全 key 可解析 + 运镜段稳定器化
console.log("== 1) CAMERA_MOVEMENTS 12 项运镜词表审计 ==");
for (const [key, mv] of Object.entries(CAMERA_MOVEMENTS)) {
  const shaken = SHAKE_WORDS.filter((w) => mv.prompt.toLowerCase().includes(w));
  check(shaken.length === 0, `${key} 运镜段仍含晃动词: ${shaken.join(", ")} → ${mv.prompt}`);
  const stable = MOVEMENT_PROMPT_STABLE.some((w) => mv.prompt.toLowerCase().includes(w));
  check(stable, `${key} 运镜段缺少稳定器词汇: ${mv.prompt}`);
  console.log(`  ${key.padEnd(18)} ${mv.label.padEnd(8)} ${mv.prompt}`);
}

// 2) 池首位 = 稳定默认回退位（push/pull 等推拉类）
console.log("\n== 2) ACT_MOVEMENT_POOLS 回退默认位审计 ==");
for (const [fn, pool] of Object.entries(ACT_MOVEMENT_POOLS)) {
  const first = pool[0];
  const firstPrompt = CAMERA_MOVEMENTS[first]?.prompt ?? "";
  const stable = MOVEMENT_PROMPT_STABLE.some((w) => firstPrompt.toLowerCase().includes(w));
  check(stable, `${fn} 池首位 ${first} 非稳定运镜`);
  // 池内 key 必须都在运镜库里
  for (const k of pool) check(k in CAMERA_MOVEMENTS, `${fn} 池含未知运镜 key: ${k}`);
  console.log(`  ${fn.padEnd(12)} pool[0]=${first.padEnd(18)} ${pool.join(" / ")}`);
}

// 3) 端到端合成：每个运镜出一条最终提示词，验证无晃动词 + 有全局兜底
console.log("\n== 3) composeVideoPrompt 端到端审计（全运镜 × 最终提示词）==");
let n = 0;
for (const key of Object.keys(CAMERA_MOVEMENTS)) {
  const out = composeVideoPrompt({
    shot: {
      visualDesc: "宴会厅内众人回头，水晶吊灯光斑洒在红毯上",
      visualPrompt: "crowd turns back in shock inside banquet hall, crystal chandelier light on red carpet",
      cameraMovement: key,
      shotSize: "近景",
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
  const lower = out.finalPrompt.toLowerCase();
  const shaken = SHAKE_WORDS.filter((w) => lower.includes(w));
  check(shaken.length === 0, `[${key}] 最终提示词含晃动词: ${shaken.join(", ")}`);
  const stable = STABLE_WORDS.some((w) => lower.includes(w));
  check(stable, `[${key}] 最终提示词无任何稳定器词汇`);
  check(out.segments.technical.includes("stabilized camera work"), `[${key}] 技术段缺全局兜底`);
  if (key === "handheld" || key === "whip_pan") {
    console.log(`  [${key}] finalPrompt:\n    ${out.finalPrompt}\n`);
  }
}
console.log(`  共审计 ${n} 条最终提示词`);

// 4) 技术尾巴断言
console.log("== 4) PROMPT_TECHNICAL_TAIL 全局兜底 ==");
console.log(`  "${PROMPT_TECHNICAL_TAIL}"`);
check(PROMPT_TECHNICAL_TAIL.includes("stabilized") && PROMPT_TECHNICAL_TAIL.includes("gimbal"), "技术尾巴缺稳定器词汇");

console.log(fail === 0 ? "\n✅ 全部通过：运镜词表已稳定器化，无晃动残留" : `\n❌ ${fail} 项未通过`);
process.exit(fail === 0 ? 0 : 1);
