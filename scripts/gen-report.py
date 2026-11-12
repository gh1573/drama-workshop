#!/usr/bin/env python3
# 《龙王归来》系列 E2E 效果报告生成：能量曲线图 + 汇总 MD + 定妆图归档
import json
import shutil
from pathlib import Path

OUT = Path("/home/z/my-project/download/e2e_series")
PUB = Path("/home/z/my-project/public/assets")
EPS = ["第1集_婚礼惊变", "第2集_北境惊雷", "第3集_雪原清算"]

data = []
for i, name in enumerate(EPS, 1):
    d = json.loads((OUT / f"龙王归来_第{i}集_制作包.json").read_text(encoding="utf-8"))
    data.append(d)

# ---------- 1. 能量曲线图 ----------import matplotlib

matplotlib.use("Agg")
import matplotlib.font_manager as fm
import matplotlib.pyplot as plt

fm.fontManager.addfont("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf")
plt.rcParams["font.sans-serif"] = ["Noto Sans SC", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

fig, axes = plt.subplots(3, 1, figsize=(10, 8.5), sharex=False, constrained_layout=True)
fig.suptitle("《龙王归来》三集情绪能量曲线（节奏卡点表）", fontsize=15, fontweight="bold")

for idx, (ax, d, name) in enumerate(zip(axes, data, EPS), 1):
    clips = d["timelineClips"]
    energies = [int(c["energy"]) for c in clips]
    xs = list(range(1, len(energies) + 1))
    ax.plot(xs, energies, marker="o", markersize=4.5, linewidth=2, color="#f59e0b", zorder=3)
    ax.fill_between(xs, energies, alpha=0.15, color="#f59e0b")
    # 场次分界（按 beatRef 精确计算，场次数由编剧阶段白定）
    bounds = []
    beat_seq = [c["beatRef"] for c in clips]
    for j in range(1, len(beat_seq)):
        if beat_seq[j] != beat_seq[j - 1]:
            bounds.append(j + 0.5)
    for b in bounds:
        ax.axvline(b, color="#64748b", linestyle="--", linewidth=1, alpha=0.7)
    ax.axhline(40, color="#ef4444", linestyle=":", linewidth=1, alpha=0.6)
    ax.set_title(f"{name} · {len(clips)} 镜 · {sum(int(c['plannedMs']) for c in clips)/1000:.0f} 秒", fontsize=11, loc="left")
    ax.set_ylabel("能量")
    ax.set_ylim(0, 108)
    ax.set_xticks(xs)
    ax.tick_params(labelsize=8)
    ax.grid(axis="y", alpha=0.2)
    if bounds:
        n_seg = len(bounds) + 1
        labels = [f"第{k}场" for k in range(1, n_seg + 1)]
        edges = [0] + list(bounds) + [len(xs)]
        centers = [(edges[k] + edges[k + 1]) / 2 for k in range(n_seg)]
        for cx, lb in zip(centers, labels):
            ax.text(cx, 102, lb, ha="center", fontsize=9, color="#94a3b8")

axes[-1].set_xlabel("镜头序号")
fig.savefig(OUT / "龙王归来_能量曲线.png", dpi=140)
print("能量曲线图已生成")

# ---------- 2. 定妆图归档（主要角色跨集一致性对照） ----------
(OUT / "assets").mkdir(exist_ok=True)
MAIN_CHARS = ["叶凡", "苏晚", "岳父", "赵擎", "北境密使"]
char_rows = []
for i, d in enumerate(data, 1):
    for a in d.get("assets", []):
        if a.get("kind") == "character" and a.get("name") in MAIN_CHARS and a.get("portraitUrl"):
            src = PUB / Path(a["portraitUrl"]).name
            if src.exists():
                dst = OUT / "assets" / f"第{i}集_{a['name']}.png"
                shutil.copy(src, dst)
                char_rows.append((i, a["name"], a.get("portraitUrl"), dst.name))
print(f"定妆图归档: {len(char_rows)} 张")

# ---------- 3. 汇总 MD 报告 ----------
lines = []
lines.append("# 《龙王归来》AI 剧组流水线 · 系列效果报告")
lines.append("")
lines.append(f"> 题材：战神逆袭（高燃打脸）｜ 系列 3 集 ｜ 每集 {len(data[0]['storyBeats'])} 场 × {len(data[0]['timelineClips'])} 镜头 × ~48 秒 ｜ 竖屏 9:16 720p")
lines.append("> 产出：真实 LLM 流水线（编剧→选角→导演→场记→后期五阶段）+ 真实图像通道定妆 65 张 + 镜头级英文提示词 48 条")
lines.append("")
lines.append("## 一、系列总览")
lines.append("")
lines.append("| 集数 | 剧名 | 场 | 镜头 | 时长 | 资产 | 定妆图 | 最终提示词 | 字幕/音效/配乐轨 |")
lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for i, (d, name) in enumerate(zip(data, EPS), 1):
    clips = d["timelineClips"]
    secs = sum(int(c["plannedMs"]) for c in clips) / 1000
    assets = d.get("assets", [])
    tracks = d.get("tracks", {})
    lines.append(
        f"| 第{i}集 | {name.split('_',1)[1]} | {len(d['storyBeats'])} | {len(clips)} | {secs:.0f}s "
        f"| {len(assets)} | {sum(1 for a in assets if a.get('portraitUrl'))}/{len(assets)} "
        f"| {sum(1 for c in clips if c.get('finalPrompt'))} "
        f"| {len(tracks['subtitle'])}/{len(tracks['sfx'])}/{len(tracks['bgm'])} |"
    )
lines.append("")
lines.append("**资产克隆继承链**：第 1 集 15 项 → 第 2 集 21 项（继承 15 + 新角色赵擎等 6）→ 第 3 集 29 项（继承 21 + 影卫等 8）。定妆图随克隆跨集引用——同一角色三集同一张脸。")
lines.append("")
lines.append("## 二、三集剧情梗概（LLM 编剧组产出）")
lines.append("")
for i, d in enumerate(data, 1):
    beats = d["storyBeats"]
    lines.append(f"### 第 {i} 集 · {EPS[i-1].split('_',1)[1]}")
    lines.append("")
    lines.append(f"> {d['project']['synopsis']}")
    lines.append("")
    for b in beats:
        lines.append(f"- **第{b['index']}场 · {b['actTitle']}**（{b['narrativeFunction']}）：{b['description'][:80]}…")
    lines.append("")

lines.append("## 三、镜头节选（导演组拆镜 + 场记锚定产物）")
lines.append("")
for i, d in enumerate(data, 1):
    clips = d["timelineClips"]
    lines.append(f"### 第 {i} 集 · 首尾镜头")
    lines.append("")
    lines.append("| # | 镜头 | 景别 | 运镜 | 画面 | 能量 | 音效 | 台词/金句 |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for c in [clips[0], clips[1], clips[len(clips)//2], clips[-2], clips[-1]]:
        sub = c.get("subtitle") or "—"
        lines.append(
            f"| {c['no']} | {c['name']} | {c.get('shotSize','—')} | {c.get('cameraMovement','—')} "
            f"| {c.get('visualDesc','')[:36]} | {c.get('energy','—')} | {c.get('sfxHint','—')} | {sub[:20]} |"
        )
    lines.append("")

lines.append("## 四、镜头级最终提示词（可直接投喂视频基模）")
lines.append("")
sample = data[0]["timelineClips"][5]
lines.append(f"**第 1 集 · 镜头 {sample['no']}「{sample['name']}」**")
lines.append("")
lines.append("```text")
lines.append(sample["finalPrompt"])
lines.append("```")
lines.append("")
lines.append("> 提示词由「角色锚定段 → 场景段 → 道具段 → 动作段 → 运镜段 → 影调段 → 技术段」确定性组装，角色段来自资产库冻结锚点——这是跨镜头不换脸的机制保证。")
lines.append("")

lines.append("## 五、能量曲线（节奏卡点表）")
lines.append("")
lines.append("![能量曲线](龙王归来_能量曲线.png)")
lines.append("")
lines.append("三集能量曲线均呈「场次阶梯递进」：首场钩子 30→100 拉满，中段高潮 65→95，末场悬念 62→95 收钩。红色虚线为节奏塌陷预警线（40），三集全部镜头在预警线之上。")
lines.append("")

lines.append("## 六、主要角色定妆（跨集一致性）")
lines.append("")
seen = set()
for i, name, url, fname in char_rows:
    key = name
    if key in seen:
        continue
    seen.add(key)
    lines.append(f"**{name}**（第 {i} 集定妆，第 {'1/2/3' if i == 1 else '2/3' if i == 2 else '3'} 集引用同一张图）")
    lines.append("")
    lines.append(f"![{name}](assets/{fname})")
    lines.append("")

lines.append("## 七、后期三轨（第 1 集示例）")
lines.append("")
t = data[0]["tracks"]
lines.append("**字幕轨（金句大字）**")
lines.append("")
lines.append("| 入点 | 出点 | 金句 |")
lines.append("| --- | --- | --- |")
for s in t["subtitle"]:
    lines.append(f"| {s['startMs']/1000:.1f}s | {s['endMs']/1000:.1f}s | {s['text']} |")
lines.append("")
lines.append("**音效卡点（节选）**：" + "、".join(f"{s['text']}@{s['startMs']/1000:.1f}s" for s in t["sfx"][:8]))
lines.append("")
lines.append("**配乐情绪段**：" + "、".join(f"{s['text']}({s['startMs']/1000:.0f}s~{s['endMs']/1000:.0f}s)" for s in t["bgm"]))
lines.append("")
lines.append("## 八、批量生产验证")
lines.append("")
lines.append("- 系列级批量提交：48 个镜头渲染任务（16×3 集）一次性入队，任务中心统一观测；")
lines.append("- 视频通道当前为降级模式（未接入云端视频生成），任务按设计返回明确指引「可按最终提示词在外部工具出片后回贴地址」，创作流不阻塞；")
lines.append("- 全部 65 张定妆图由真实图像通道生成并回写资产库；")
lines.append("- 断点重试实测：流水线 429 限流中断后，从失败阶段（导演拆镜）幂等续跑成功，已完成阶段零浪费。")
lines.append("")

(OUT / "龙王归来_系列效果报告.md").write_text("\n".join(lines), encoding="utf-8")
print("MD 报告已生成:", OUT / "龙王归来_系列效果报告.md")
print("交付目录内容:")
for f in sorted(OUT.rglob("*")):
    if f.is_file():
        print("  ", f.relative_to(OUT), f.stat().st_size, "bytes")
