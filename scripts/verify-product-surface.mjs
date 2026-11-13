/**
 * v2.9 产品交付面验证（零外部通道调用）
 * 断言：① 连载一键续写 API 合约（adopt / 继承 / 资产克隆 / 梗概校验）
 *      ② 制作包 ZIP 结构（签名 / 目录契约 / 分镜表 / SRT / CRC 可解）
 *      ③ UI 触点静态存在（续写 CTA / 制作包按钮 / 成片入口条）
 * 用法：node scripts/verify-product-surface.mjs（需 dev server 在 3000 端口）
 * 前置：若无项目会先跑 seed-demo-project.mjs（零配额）
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const BASE = "http://localhost:3000/api";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `（${detail}）` : ""}`);
  if (!ok) process.exitCode = 1;
};

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return { status: res.status, json: await res.json().catch(() => null), res };
}

/** 极简 ZIP 中央目录解析（只取文件名清单） */
function zipNames(buf) {
  const sig = buf.readUInt32LE(0);
  if (sig !== 0x04034b50) throw new Error("非 ZIP（local header 签名缺失）");
  // 从尾部找 EOCD
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      const count = buf.readUInt16LE(i + 10);
      const cdOffset = buf.readUInt32LE(i + 16);
      const names = [];
      let p = cdOffset;
      for (let n = 0; n < count; n++) {
        const nameLen = buf.readUInt16LE(p + 28);
        names.push(buf.toString("utf8", p + 46, p + 46 + nameLen));
        p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
      }
      return names;
    }
  }
  throw new Error("EOCD 未找到");
}

// —— 0. 环境 ——
if (!(await fetch(BASE + "/projects").catch(() => null))) {
  console.error("dev server 未启动（curl localhost:3000）");
  process.exit(1);
}
let projects = (await api("/projects")).json?.data ?? [];
if (projects.length === 0) {
  execSync("node scripts/seed-demo-project.mjs", { cwd: process.cwd(), stdio: "inherit" });
  projects = (await api("/projects")).json?.data ?? [];
}

// 清扫上次运行残留的验证集（synopsis 标记词），再挑有真实内容的项目做宿主
for (const p of projects) {
  const d = (await api(`/projects/${p.id}`)).json?.data;
  if (d?.synopsis?.includes("验证脚本")) {
    await api(`/projects/${p.id}`, { method: "DELETE" });
  }
}
projects = (await api("/projects")).json?.data ?? [];
let host = null;
for (const p of projects) {
  const d = (await api(`/projects/${p.id}`)).json?.data;
  if (d && d.finalVideoUrl && (d.timelineClips?.length ?? 0) > 0) {
    host = d;
    break;
  }
}
check("存在可验证项目（有成片 + 镜头轨）", !!host, host?.title);
if (!host) {
  console.log(results.join("\n"));
  process.exit(1);
}

// —— 1. 连载一键续写合约 ——
const tooShort = await api(`/projects/${host.id}/next-episode`, {
  method: "POST",
  body: JSON.stringify({ synopsis: "太短" }),
});
check("梗概 <10 字被 422 拦截", tooShort.status === 422);

const created = await api(`/projects/${host.id}/next-episode`, {
  method: "POST",
  body: JSON.stringify({ synopsis: "验证脚本：身份曝光后反派势力反扑，主角布下惊天棋局请君入瓮，一网打尽。" }),
});
const before = host; // 宿主详情已在挑选时取得
check("一键续写 200/ok", created.status === 200 && created.json?.ok === true);
const ep = created.json?.data ?? {};
check("新集响应含 seriesId/episodeNo/clonedAssets", !!ep.seriesId && typeof ep.episodeNo === "number" && typeof ep.clonedAssets === "number", `第 ${ep.episodeNo} 集 · 克隆 ${ep.clonedAssets} 资产`);
check("题材参数继承（genreName 一致）", ep.genre?.name === before.genre?.name, `${ep.genre?.name}`);
check("资产克隆（定妆图地址逐一相同）", (() => {
  const a = (before.assets ?? []).map((x) => x.portraitUrl).filter(Boolean).sort();
  const b = (ep.assets ?? []).map((x) => x.portraitUrl).filter(Boolean).sort();
  return a.length > 0 && JSON.stringify(a) === JSON.stringify(b);
})(), `${ep.assets?.length ?? 0} 资产`);
const after = (await api(`/projects/${host.id}`)).json.data;
check("原项目已 adopt（seriesId/episodeNo=1 或沿用既有系列）", !!after.seriesId && after.seriesId === ep.seriesId && (after.episodeNo ?? 1) < ep.episodeNo);

// —— 2. 制作包 ZIP 结构 ——
const pkg = await fetch(`${BASE}/projects/${host.id}/package`);
check("制作包 200 + application/zip", pkg.status === 200 && (pkg.headers.get("content-type") ?? "").includes("zip"));
check("Content-Disposition 含 RFC 5987 文件名", (pkg.headers.get("content-disposition") ?? "").includes("filename*"));
const zipBuf = Buffer.from(await pkg.arrayBuffer());
let names = [];
try {
  names = zipNames(zipBuf);
  check("ZIP 可解析（PK 签名 + 中央目录）", true, `${names.length} 文件`);
} catch (e) {
  check("ZIP 可解析（PK 签名 + 中央目录）", false, e.message);
}
for (const dir of ["01_成片/", "02_镜头素材/", "03_定妆图/", "05_文档/分镜表.md", "06_工程档案.json"]) {
  check(`包内含 ${dir}`, names.some((n) => n === dir || n.startsWith(dir)));
}
// 分镜表内容：表头与镜号
{
  // 用 python 解 zip 内容（CRC 校验顺带做）
  fs.writeFileSync("/tmp/verify-pkg.zip", zipBuf);
  const out = execSync(
    `python3 -c "
import zipfile
z = zipfile.ZipFile('/tmp/verify-pkg.zip')
assert z.testzip() is None, 'CRC 失败'
md = z.read('05_文档/分镜表.md').decode('utf-8')
assert '| 镜号 |' in md and '画面提示词' in md, '分镜表缺表格/提示词'
print('md-ok')
"`,
    { encoding: "utf8" }
  ).trim();
  check("分镜表内容（表格 + 提示词档案）+ CRC 全过", out === "md-ok");
}

// —— 3. UI 触点静态断言（源码契约） ——
const src = (p) => fs.readFileSync(p, "utf8");
check("成片页签「创作下一集」CTA", src("src/components/workbench/final-cut-panel.tsx").includes("创作下一集"));
check("成片页签「下载制作包 ZIP」", src("src/components/workbench/final-cut-panel.tsx").includes("下载制作包 ZIP"));
check("项目库系列分组「创作下一集」直发", src("src/components/workbench/project-library-drawer.tsx").includes("创作第"));
check("节奏页成片入口条", src("src/components/workbench/rhythm-panel.tsx").includes("本集成片已就绪"));
check("信息卡连续剧徽标", src("src/components/workbench/project-info-card.tsx").includes("第 {session.episodeNo"));
check("首页连续剧/制作包表达", src("src/app/page.tsx").includes("连续剧创作路径") && src("src/app/page.tsx").includes("制作包一键下载"));

// —— 清理验证产物（删除本脚本创建的验证集，不动演示数据） ——
if (ep.id) {
  const del = await api(`/projects/${ep.id}`, { method: "DELETE" });
  check("清理验证集", del.status === 200 || del.json?.ok === true);
}

console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} 通过`);
