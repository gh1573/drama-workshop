// 单测：standaloneFailureText 确定性与口径
import { standaloneFailureText, humanizeError } from "/home/z/my-project/src/lib/humanize-error.ts";
const cases = [
  ['API request failed with status 429: {"error":"Too many requests, please try again later"}', '429 限流'],
  ['fetch failed', '网络'],
  ['Error: timeout of 60000ms exceeded', '超时'],
  ['finish_reason: length', '截断'],
  ['SyntaxError: Unexpected token in JSON', '解析'],
  ['something totally unknown xyz', '未知(应 null)'],
];
let pass = 0;
for (const [raw, label] of cases) {
  const out = standaloneFailureText(raw);
  console.log(`[${label}] →`, out ? out.slice(0, 60) + '…' : 'null');
  if (label.includes('未知')) { if (out === null) pass++; }
  else if (out && !out.includes('断点续拍')) pass++; // 独立口径绝不提断点续拍
}
// 同一错误两个口径标题一致
const raw429 = 'API request failed with status 429';
const a = humanizeError(raw429)?.title, b = standaloneFailureText(raw429)?.split('。')[0];
console.log('标题一致性:', a === b ? 'PASS' : `FAIL ${a} vs ${b}`);
console.log(`独立口径检查: ${pass}/6 ${pass === 6 ? 'PASS' : 'FAIL'}`);
