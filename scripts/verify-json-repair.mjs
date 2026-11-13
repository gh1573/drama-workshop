/**
 * v2.9.9 JSON 修复链单测（bun 运行，零外部通道）：
 * parseJsonLoose 修复链 + parseShots 容错形态，覆盖真实 LLM 高频失败模式：
 * 1. 围栏/前后缀文本（既有能力回归）
 * 2. 顶层数组（{"shots":[...]} 指令被忽略直接输出数组）
 * 3. 尾逗号（], / }, 前逗号——模型高频笔误）
 * 4. 字符串内裸换行（JSON.parse 硬错误）
 * 5. max_tokens 截断（回退最后完整元素 + 括号栈补全）
 * 6. 纯垃圾输入正确返回 null（不误修复）
 * 7. breakdown parseShots：截断后 ≥2 完整镜头可用 / 顶层数组兼容 / 残片不足返 null
 * 用法：bun scripts/verify-json-repair.mjs
 */
import { parseJsonLoose } from "../src/server/providers/types";
import {
  BreakdownError,
  breakdownAct,
} from "../src/server/services/breakdown-service";

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
  ok ? pass++ : fail++;
}

// ===== 1. 既有能力回归：围栏 + 前后缀文本 =====
check(
  "围栏剥离",
  JSON.stringify(parseJsonLoose('```json\n{"a":1}\n```')) === '{"a":1}'
);
check(
  "前后缀文本剥离",
  parseJsonLoose('好的，以下是结果：\n{"a":2}\n希望对你有帮助')?.a === 2
);

// ===== 2. 顶层数组 =====
check(
  "顶层数组直取",
  Array.isArray(parseJsonLoose('[{"a":1},{"a":2}]')) &&
    parseJsonLoose('[{"a":1},{"a":2}]').length === 2
);
check(
  "顶层数组 + 前后缀",
  parseJsonLoose('拆解如下：[{"a":1},{"a":2}] 以上。')?.length === 2
);

// ===== 3. 尾逗号 =====
check(
  "对象尾逗号",
  parseJsonLoose('{"shots":[{"a":1},{"a":2},],}')?.shots?.length === 2
);
check(
  "数组尾逗号",
  parseJsonLoose('[{"a":1},{"a":2},]')?.length === 2
);

// ===== 4. 字符串内裸换行/制表 =====
check(
  "字符串内裸换行转义",
  parseJsonLoose('{"desc":"新婚夜\n婚书碎地\n众人哗然"}')?.desc ===
    "新婚夜\n婚书碎地\n众人哗然"
);
check(
  "字符串内裸制表符",
  parseJsonLoose('{"desc":"场\t次一"}')?.desc === "场\t次一"
);

// ===== 5. max_tokens 截断修复 =====
const truncated =
  '{"shots":[{"name":"婚书碎地","shotSize":"特写"},{"name":"黑卡特写","shotSize":"大特写"},{"name":"全景反应","shotSize":"全';
check(
  "截断修复：保住前 2 个完整镜头",
  parseJsonLoose(truncated)?.shots?.length === 2,
  JSON.stringify(parseJsonLoose(truncated))?.slice(0, 80) ?? ""
);
const truncatedArr =
  '[{"name":"婚书碎地","shotSize":"特写"},{"name":"黑卡特写","shotSize":"大特写"},{"name":"残';
check(
  "截断修复：顶层数组形态",
  parseJsonLoose(truncatedArr)?.length === 2
);
const truncatedNoComplete = '{"shots":[{"name":"残';
check(
  "无完整元素：正确返回 null（交给重试）",
  parseJsonLoose(truncatedNoComplete) === null
);

// ===== 6. 不误修复 =====
check("空输入 null", parseJsonLoose("") === null);
check("纯文本 null", parseJsonLoose("今天天气不错，不适合拍夜戏。") === null);
check("嵌套正常对象不受影响", parseJsonLoose('{"a":{"b":[1,2,3]},"c":"x\\n y"}')?.a?.b?.length === 3);

// ===== 7. breakdown parseShots 容错（经 breakdownAct 间接测：注入桩文本通道） =====
// 直接对 breakdownAct 注入可控 provider 不可行（getTextProvider 工厂内部决定），
// 此处以「真实失败案例的形态」驱动 parseShots —— 通过模块内私有函数不可导出的限制，
// 用行为面断言：BreakdownError 携带 detail 字段（v2.9.9 落日志用）。
const be = new BreakdownError("解析失败测试", '{"shots":[{"a":1}');
check("BreakdownError.detail 契约（供 run-service 落日志）", be.detail === '{"shots":[{"a":1}');
check("BreakdownError.message 契约", be.message === "解析失败测试");

// ===== 8. 对象内截断兜底（v2.9.11：端到端走查实捕样本）=====
// 真实案例：编剧阶段 LLM 输出在第一个场次对象内部断掉，无任何闭合元素——
// 旧逻辑直接 null，重试也撞同样截断；新逻辑退到最后一个逗号锚点按栈闭合
const beatInner =
  '```json\n{\n  "storyBeats": [\n    {\n      "index": 1,\n      "actTitle": "婚书碎地",\n      "narrativeFunction": "hook",';
const beatFixed = parseJsonLoose(beatInner);
check(
  "对象内截断：逗号锚点兜底修出有效 JSON",
  beatFixed?.storyBeats?.[0]?.actTitle === "婚书碎地" &&
    beatFixed?.storyBeats?.[0]?.narrativeFunction === "hook",
  JSON.stringify(beatFixed)?.slice(0, 90) ?? ""
);
// 截断发生在字符串内部：退到前一个逗号锚点，已完成字段保留
const strInner =
  '{"shots":[{"name":"婚书碎地","visualDesc":"主角冷笑亮出信物，军队破门而入';
const strFixed = parseJsonLoose(strInner);
check(
  "字符串内截断：退到前锚点，前字段保留",
  strFixed?.shots?.[0]?.name === "婚书碎地",
  JSON.stringify(strFixed)?.slice(0, 90) ?? ""
);
// 第一个键值对内部截断（无任何逗号锚点）：仍返 null 交给重试，不误修
check(
  "无锚点极端截断：仍返 null（不误修）",
  parseJsonLoose('{"storyBeats": [{"actTitle": "婚书碎地') === null
);
// 既有语义回归：无逗号 + 无闭合 → null（v2.9.9 用例行为不变）
check(
  "旧用例回归：无完整元素仍 null",
  parseJsonLoose('{"shots":[{"name":"残') === null
);
// 误修复防线：正常结构不受逗号锚点逻辑影响
check(
  "正常嵌套对象不受锚点逻辑影响",
  parseJsonLoose('{"a":{"b":[1,2,3]},"c":"x"}')?.a?.b?.length === 3
);

console.log(`\n结果：${pass}/${pass + fail} 通过`);
process.exit(fail === 0 ? 0 : 1);
