/**
 * v2.9.7/v2.9.8 回归夹具：零配额构造「15 镜待出片」在制项目（不走流水线）。
 * 用途：verify-v297.cjs（一键渲染 noop 秒败计时）与 verify-v297-batch.cjs（单镜渲染播报）
 *       需要多镜未合成项目；真实流水线项目已随 E2E 清理，本夹具零 LLM/图像/视频配额。
 * 手动片段无 finalPrompt 会被 render-all 跳过 → 逐镜 PATCH finalPrompt 满足提交前提。
 * 用法：node scripts/fixture-pending-project.cjs   （输出项目 id；失败退出码 1）
 */
const BASE = "http://localhost:3000";
const TAG = "v297回归夹具";

(async () => {
  const api = async (url, init) => {
    const res = await fetch(BASE + url, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      throw new Error(`${url} -> HTTP ${res.status}: ${json?.error ?? ""}`);
    }
    return json?.data ?? json;
  };

  const created = await api("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      genre: {
        id: "shuangwen", name: "战神逆袭 · 龙王归来", badge: "高燃打脸 · 爽感爆棚",
        hookTactic: "fixture", musicMood: "fixture", tonePrompt: "fixture",
      },
      synopsis: `${TAG}：15 镜待出片回归项目（零配额夹具，验收后可删）`,
      modelConfig: {
        videoModel: "Omni 1.2 Flash", durationSeconds: 5, resolution: "720p",
        scriptThinkingLevel: "low", enablePromptEnhance: true,
      },
    }),
  });
  const pid = created.id;
  const beats = [1, 2, 3].map((i) => ({
    index: i,
    actTitle: `夹具场 ${i}`,
    narrativeFunction: i === 1 ? "hook" : i === 2 ? "buildup" : "cliffhanger",
    pacingNote: "0~12s", description: "回归夹具场次", dialogueSubtitle: "夹具台词",
    cameraMovement: "固定机位", promptGuidance: "fixture",
  }));
  await api(`/api/projects/${pid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyBeats: beats }),
  });
  for (let i = 1; i <= 15; i++) {
    const clip = await api(`/api/projects/${pid}/clips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        beatIndex: ((i - 1) % 3) + 1,
        name: `镜${String(i).padStart(2, "0")}`,
        subtitle: "",
        format: "mp4",
      }),
    });
    await api(`/api/clips/${clip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalPrompt: "[Fixture] verification prompt for noop fast-fail." }),
    });
  }
  console.log(JSON.stringify({ ok: true, id: pid, tag: TAG }));
})();
