/**
 * v2.9.18 上游风暴自动续拍——实弹验证（纯 API 权威观测，零浏览器）
 *
 * 背景：走查实证 429 风暴期一次开机需手动点 4 轮「断点续拍」。本轮为
 * run 级自动续拍（退避 45s/90s/180s，上限 3 轮，剧组日志全程播报）。
 *
 * 流程：立项（重生复仇题材 + 新梗概）→ POST /runs 开机 → 每 15s 轮询
 * run 状态与剧组日志增量 → 记录状态迁移与自动续拍播报链。
 *
 * 判定（三 PASS 一 FAIL）：
 *  - run.status === succeeded → PASS（顺滑路径无回归，自动续拍零干扰）
 *  - 日志出现「自动续拍（第 N 轮，无人值守）」→ PASS（自动点火实锤）
 *  - 日志出现「已达 3 轮上限」→ PASS（上限纪律实锤）
 *  - failed 且 error 命中瞬时类判据但全程无自动续拍播报 → FAIL
 *
 * 用法：node scripts/verify-auto-resume.mjs [预算秒数，默认 1800]
 */
const BASE = "http://localhost:3000";
const BUDGET_MS = Number(process.argv[2] ?? 1800) * 1000;
/** 可选：--observe <projectId> 直接观测既有项目的 run（不新建、不再耗配额） */
const OBSERVE_ID = process.argv.includes("--observe")
  ? process.argv[process.argv.indexOf("--observe") + 1]
  : null;

const GENRE = {
  id: "chongsheng",
  name: "重生复仇 · 逆天改命",
  badge: "前世记忆 · 步步为营",
  hookTactic:
    "0~3s 死亡瞬间闪回：被害坠楼与睁眼回到十年前叠化，仇人笑脸特写与记忆重合",
  musicMood: "空灵女声吟唱渐入、心跳音效渐强、时钟倒转混响",
  tonePrompt:
    "moody revenge thriller, cold desaturated grade with crimson accents, rain-soaked night streets, dramatic rim lighting, flashback cross-fade aesthetic, piercing gaze close-ups",
};
const SYNOPSIS =
  "旧档案室深夜失火，焚毁的是十年前她「意外坠亡」的唯一卷宗；重生回来的鉴定科法医从灰烬里抢出半页鉴定书，上面签着现任刑侦队长当年的名字。她决定重新入职这支队伍，从第一起悬案开始，把十年前的每一条证据链亲手缝回去。";

const TRANSIENT_RE =
  /429|rate.?limit|限流|status 5\d\d|internal server error|bad gateway|service unavailable|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|network|timed? ?out|aborted|被截断|truncat|空内容|连续重试仍无法解析/i;

const ts = () => new Date().toISOString().slice(11, 19);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

const run = async () => {
  console.log(`[${ts()}] v2.9.18 自动续拍实弹验证 · 预算 ${BUDGET_MS / 1000}s${OBSERVE_ID ? ` · 观测模式 ${OBSERVE_ID}` : ""}`);

  let projectId;
  let runId;
  if (OBSERVE_ID) {
    projectId = OBSERVE_ID;
    const list = await api(`/api/projects/${projectId}/runs`);
    runId = (list.data ?? list)[0]?.id;
    console.log(`[${ts()}] 观测既有 run: ${runId}`);
  } else {
  // 1. 立项
  const created = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: "灰烬鉴定书",
      genre: GENRE,
      synopsis: SYNOPSIS,
      modelConfig: {
        videoModel: "seedance-2.0",
        durationSeconds: 5,
        resolution: "720p",
        scriptThinkingLevel: "medium",
        enablePromptEnhance: false,
      },
    }),
  });
  projectId = created.data?.id ?? created.id;
  console.log(`[${ts()}] 立项成功: ${projectId}`);

  // 2. 开机
  const started = await api(`/api/projects/${projectId}/runs`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  runId = started.data?.id ?? started.id;
  console.log(`[${ts()}] 开机: runId=${runId}`);
  }

  // 3. 轮询观测
  const t0 = Date.now();
  let lastStatus = null;
  let lastJournalLen = 0;
  let autoFiredRounds = 0;
  let capReached = false;
  let sawScheduleAnnounce = false;
  let finalError = "";

  while (Date.now() - t0 < BUDGET_MS) {
    await sleep(15000);
    const list = await api(`/api/projects/${projectId}/runs`);
    const r = (list.data ?? list)[0];
    if (!r) throw new Error("run 列表为空");

    if (r.status !== lastStatus) {
      console.log(
        `[${ts()}] 状态: ${lastStatus ?? "—"} → ${r.status} · progress=${r.progress}% · stage=${r.stage ?? "-"}${r.error ? ` · error=${String(r.error).slice(0, 120)}` : ""}`
      );
      lastStatus = r.status;
    }
    // 日志增量播报
    for (const line of r.journal.slice(lastJournalLen)) {
      const msg = `[${line.role}] ${line.message}`;
      if (/自动续拍|断点续拍|阶段失败|杀青/.test(msg)) {
        console.log(`[${ts()}]   日志> ${msg.slice(0, 150)}`);
      }
      if (msg.includes("，无人值守）：从")) autoFiredRounds++;
      if (msg.includes("后自动续拍（第")) sawScheduleAnnounce = true;
      if (msg.includes("已达 3 轮上限")) capReached = true;
    }
    lastJournalLen = r.journal.length;

    if (r.status === "succeeded") {
      console.log(`\n[${ts()}] ===== 判定：PASS（顺滑杀青）=====`);
      console.log("自动续拍轮次: 0（无需介入）· 全程无需人工值守");
      return { verdict: "pass", mode: "happy-path", projectId, runId };
    }
    if (r.status === "failed") {
      finalError = r.error ?? "";
      // failed 后自动续拍定时器最长 180s——给 200s 观察窗看是否自动复活
      const watchUntil = Date.now() + 200000;
      while (Date.now() < watchUntil) {
        await sleep(15000);
        const cur = (await api(`/api/projects/${projectId}/runs`)).data?.[0];
        for (const line of cur.journal.slice(lastJournalLen)) {
          const msg = `[${line.role}] ${line.message}`;
          if (/自动续拍|断点续拍|阶段失败|杀青/.test(msg))
            console.log(`[${ts()}]   日志> ${msg.slice(0, 150)}`);
          if (msg.includes("，无人值守）：从")) autoFiredRounds++;
          if (msg.includes("后自动续拍（第")) sawScheduleAnnounce = true;
          if (msg.includes("已达 3 轮上限")) capReached = true;
        }
        lastJournalLen = cur.journal.length;
        if (cur.status === "running") {
          console.log(`[${ts()}] 失败后自动复活 → running（无需人工）`);
          finalError = "";
          break;
        }
        if (cur.status === "succeeded") {
          console.log(`\n[${ts()}] ===== 判定：PASS（失败后自动续拍到杀青）=====`);
          console.log(`自动续拍点火: ${autoFiredRounds} 轮 · 全程无人工`);
          return { verdict: "pass", mode: "auto-resume-to-success", projectId, runId, autoFiredRounds };
        }
        if (cur.status === "failed") finalError = cur.error ?? "";
      }
      if (lastStatus === "running") continue; // 已复活，回主循环
      // 200s 仍 failed：要么达上限停机，要么调度链断裂
      if (capReached) {
        console.log(`\n[${ts()}] ===== 判定：PASS（上限纪律——3 轮后续停，人工接管）=====`);
        console.log(`最终 error: ${finalError.slice(0, 200)}`);
        return { verdict: "pass", mode: "cap-reached", projectId, runId, autoFiredRounds, finalError };
      }
      if (sawScheduleAnnounce && autoFiredRounds > 0) {
        console.log(`\n[${ts()}] 观察窗内未见复活但已有自动点火记录，视为风暴中——继续主循环`);
        continue;
      }
      if (TRANSIENT_RE.test(finalError) && !sawScheduleAnnounce) {
        console.log(`\n[${ts()}] ===== 判定：FAIL（瞬时失败但无自动续拍播报）=====`);
        console.log(`error: ${finalError.slice(0, 300)}`);
        return { verdict: "fail", mode: "no-auto-resume", projectId, runId, finalError };
      }
      console.log(`[${ts()}] failed（非瞬时类或已播报）——继续观察上限/复活`);
    }
  }

  console.log(`\n[${ts()}] ===== 预算耗尽 =====`);
  console.log(`末态: ${lastStatus} · 自动点火 ${autoFiredRounds} 轮 · 上限停机 ${capReached}`);
  console.log(finalError ? `error: ${finalError.slice(0, 200)}` : "");
  return { verdict: "timeout", mode: "budget", projectId, runId, autoFiredRounds, capReached, finalError };
};

run()
  .then((r) => {
    console.log("\nRESULT:", JSON.stringify(r));
    process.exit(r.verdict === "pass" ? 0 : 1);
  })
  .catch((err) => {
    console.error("脚本异常:", err.message);
    process.exit(2);
  });
