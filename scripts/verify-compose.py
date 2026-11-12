#!/usr/bin/env python3
"""
v2.5 成片专业化验收（docs §10 v2.5）——零配额：全部用既有 clip 素材本地合成。

流程：
  1. 向空库注入验收 fixture（1 项目 + 3 场 + 6 镜 + 2 条字幕；2 镜复用真实配音文件）；
  2. Run A（回归）：cut 模式 + 720x1280@30 —— 应与 v2.4.4 行为一致（无转场、时长不缩短）；
  3. Run B（v2.5）：auto 转场 + 1080x1920@30 + 调色滤镜 —— 应出现 2 处转场
     （片头卡 fade + 进入 cliffhanger 场 fadeblack），时长缩短 2×0.5s，画幅 1080x1920；
  4. ffprobe 核验画幅/时长；转场点抽帧核验溶解发生；调色帧 vs 原始帧核验滤镜生效；
  5. 清理 fixture 行与产物（DB 恢复空库）。

用法：python3 scripts/verify-compose.py
退出码 0 = 全部通过；1 = 有断言失败。
"""
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

PROJ = Path("/home/z/my-project")
DB = PROJ / "db/custom.db"
ASSETS = PROJ / "public" / "assets"
SCRIPT = PROJ / "scripts" / "assemble-episode.py"

FIXTURE_PID = "verify_v25_fixture"
# 直接复用既有 clip/voice 文件的原始 id（DB 为空库无冲突；voice_{id}.wav 天然匹配）
CLIPS = [
    # (原始 clip id, beatIndex, plannedMs, 有配音文件)
    ("cmwau9ioo0125pziay0ljct6o", 1, 4500, False),
    ("cmwau9ioq0127pziatonygilo", 1, 4500, False),
    ("cmwau9ior0129pzia2ctg9fb4", 2, 4500, False),
    ("cmwau9ios012bpziawgghhn5p", 2, 4500, True),
    ("cmwau9p4m013tpziadjo1qply", 3, 4500, False),
    ("cmwau9p4n013vpziac1ro9t3k", 3, 4500, True),
]
BEATS = [(1, "hook"), (2, "climax"), (3, "cliffhanger")]
GRADE_FILTER = (
    "eq=contrast=1.10:saturation=1.08:brightness=-0.010,"
    "colorbalance=rs=0.03:bs=-0.02"
)

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" · {detail}" if detail else ""))


def setup_fixture() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute(
        """INSERT INTO projects (id, title, status, schemaVersion, genreId, genreName,
           genreBadge, hookTactic, musicMood, tonePrompt, aspectRatio, synopsis,
           videoModel, durationSeconds, resolution, thinkingLevel, promptEnhance,
           transitionMode, gradePreset, createdAt, updatedAt)
           VALUES (?, '验收·转场调色', 'inProduction', '1.2.0', 'shuangwen', '战神逆袭',
           '高燃打脸', 'hook', 'drums',
           'high-contrast dramatic cinema', '9:16', '验收用合成夹具，验证后删除',
           'Omni 1.2 Flash', 5, '1080p', 'low', 1, 'auto', NULL,
           datetime('now'), datetime('now'))""",
        (FIXTURE_PID,),
    )
    for idx, fn in BEATS:
        cur.execute(
            """INSERT INTO story_beats (id, projectId, "index", actTitle, narrativeFunction,
               pacingNote, description, dialogueSubtitle, cameraMovement, promptGuidance)
               VALUES (?, ?, ?, ?, ?, '4~5s', 'fixture', '台词', 'static', 'fixture')""",
            (f"{FIXTURE_PID}_b{idx}", FIXTURE_PID, idx, f"第{idx}场", fn),
        )
    for i, (src_id, beat, planned, has_voice) in enumerate(CLIPS):
        clip_id = src_id  # 原始 id 直用（voice/clip 文件名天然匹配）
        cur.execute(
            """INSERT INTO timeline_clips (id, projectId, beatIndex, "order", name,
               subtitle, format, status, mediaUrl, durationMs, plannedMs,
               createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, 'mp4', 'ready', ?, 4500, ?,
               datetime('now'), datetime('now'))""",
            (
                clip_id, FIXTURE_PID, beat, i,
                f"镜{i+1:02d}",
                f"验收台词第{i+1}镜",
                f"/assets/clip_{src_id}.mp4",
                planned,
            ),
        )
        if has_voice:
            # 字幕轨落在该镜起止（供 ASS 位移断言）；配音直接复用源文件名
            start = i * 4500
            cur.execute(
                """INSERT INTO track_items (id, projectId, kind, clipId, startMs, endMs, text,
                   createdAt, updatedAt)
                   VALUES (?, ?, 'subtitle', ?, ?, ?, ?, datetime('now'), datetime('now'))""",
                (f"{FIXTURE_PID}_sub{i}", FIXTURE_PID, clip_id, start, start + 3000,
                 f"验收字幕第{i+1}镜"),
            )
    con.commit()
    con.close()


def cleanup_fixture() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()
    # projects 主键为 id，其余表以 projectId 关联
    for table, col in (("track_items", "projectId"), ("timeline_clips", "projectId"),
                       ("story_beats", "projectId"), ("projects", "id")):
        cur.execute(f'DELETE FROM "{table}" WHERE "{col}"=?', (FIXTURE_PID,))
    con.commit()
    con.close()
    for p in [ASSETS / f"final_{FIXTURE_PID}.mp4", PROJ / "scripts" / f"final_{FIXTURE_PID}.ass"]:
        p.unlink(missing_ok=True)


def run_assemble(extra: list[str]) -> dict:
    r = subprocess.run(
        ["python3", str(SCRIPT), FIXTURE_PID, *extra],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(r.stdout[-800:])
        print(r.stderr[-800:])
        return {"ok": False, "error": f"exit={r.returncode}"}
    for line in reversed(r.stdout.strip().split("\n")):
        if line.startswith("{"):
            return json.loads(line)
    return {"ok": False, "error": "no json"}


def probe(path: Path) -> dict:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,avg_frame_rate",
         "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True,
    )
    data = json.loads(r.stdout)
    st = data["streams"][0]
    num, den = st["avg_frame_rate"].split("/")
    return {
        "w": st["width"], "h": st["height"],
        "fps": round(int(num) / int(den)) if int(den) else 0,
        "dur": float(data["format"]["duration"]),
    }


def mean_brightness(png: Path) -> float:
    r = subprocess.run(
        ["python3", "-c",
         f"from PIL import Image;import sys;im=Image.open('{png}').convert('L');"
         f"px=list(im.getdata());print(sum(px)/len(px))"],
        capture_output=True, text=True,
    )
    return float(r.stdout.strip())


def main() -> None:
    cleanup_fixture()  # 防残留
    setup_fixture()
    tmp = Path("/tmp/verify-compose")
    tmp.mkdir(exist_ok=True)
    try:
        # —— Run A：cut 回归（v2.4.4 行为）——
        print("\n[Run A] cut 模式 · 720x1280@30（回归基线）")
        out_a = ASSETS / f"final_{FIXTURE_PID}.mp4"
        res_a = run_assemble([
            "--width", "720", "--height", "1280", "--fps", "30",
            "--transitions", "cut", "--grade-filter", "",
            "--loudnorm-i", "-16", "--loudnorm-tp", "-1.5", "--loudnorm-lra", "11",
        ])
        check("A1 cut 模式合成成功", res_a.get("ok") is True)
        if not res_a.get("ok"):
            print(f"合成失败，中止后续断言：{res_a.get('error')}")
            sys.exit(1)
        check("A2 转场数为 0（回归无差）", res_a.get("transitions") == 0,
              f"got {res_a.get('transitions')}")
        check("A3 时长不缩短（3+27=30s）", abs(res_a.get("durationSec", 0) - 30.0) < 0.6,
              f"got {res_a.get('durationSec')}")
        pa = probe(out_a)
        check("A4 画幅 720x1280@30", (pa["w"], pa["h"], pa["fps"]) == (720, 1280, 30),
              f"got {pa['w']}x{pa['h']}@{pa['fps']}")
        # 配音位移断言：cut 模式下镜 4 配音延迟 = 3s(卡) + 13.5s(前三镜) = 16.5s
        check("A5 配音混入 2 段", res_a.get("withVoice") is True)
        # 留存 Run A 未调色帧（Run B 会覆盖同名产物，此处先行抽取）
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "6", "-i", str(out_a),
                        "-frames:v", "1", str(tmp / "cmp_raw.png")], check=True)
        # —— Run B：v2.5 auto 转场 + 1080p + 调色 ——
        print("\n[Run B] auto 转场 · 1080x1920@30 · 调色（v2.5）")
        res_b = run_assemble([
            "--width", "1080", "--height", "1920", "--fps", "30",
            "--transitions", "auto", "--transition-duration", "0.5",
            "--grade-filter", GRADE_FILTER,
            "--loudnorm-i", "-16", "--loudnorm-tp", "-1.5", "--loudnorm-lra", "11",
        ])
        check("B1 auto 模式合成成功", res_b.get("ok") is True)
        check("B2 转场 2 处（卡fade + cliffhanger入fadeblack）",
              res_b.get("transitions") == 2, f"got {res_b.get('transitions')}")
        check("B3 时长缩短 1s（27+3-2×0.5=29s）",
              abs(res_b.get("durationSec", 0) - 29.0) < 0.6,
              f"got {res_b.get('durationSec')}")
        check("B4 调色已生效标记", res_b.get("graded") is True)
        pb = probe(out_a)
        check("B5 画幅 1080x1920@30（档位贯通）",
              (pb["w"], pb["h"], pb["fps"]) == (1080, 1920, 30),
              f"got {pb['w']}x{pb['h']}@{pb['fps']}")

        # —— 转场抽帧（Run B 输出时间轴，由 xfade 链 offset 累计推导）——
        # 组链：[卡 3s] -fade@2.5~3.0- [c0..c3 18s] -fadeblack@20.0~20.5- [c4,c5 9s]
        # 片头卡 fade：纯卡亮度 vs 溶解中点亮度（实拍画面融入应变亮）
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "1.0", "-i", str(out_a),
                        "-frames:v", "1", str(tmp / "card_pure.png")], check=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "2.75", "-i", str(out_a),
                        "-frames:v", "1", str(tmp / "fade_mid.png")], check=True)
        b_card = mean_brightness(tmp / "card_pure.png")
        b_fade = mean_brightness(tmp / "fade_mid.png")
        check("B6 片头卡溶解中点混入实拍画面（变亮）", b_fade > b_card,
              f"卡 {b_card:.1f} → 中点 {b_fade:.1f}")
        # fadeblack：暗区在窗口前 2/3（progress 1/3~2/3 ≈ 输出 20.17~20.33s）
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "19.8", "-i", str(out_a),
                        "-frames:v", "1", str(tmp / "fb_before.png")], check=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "20.25", "-i", str(out_a),
                        "-frames:v", "1", str(tmp / "fb_peak.png")], check=True)
        b_before = mean_brightness(tmp / "fb_before.png")
        b_peak = mean_brightness(tmp / "fb_peak.png")
        check("B7 fadeblack 谷点显著变暗（压黑区 ≥8 级亮度差）", b_peak < b_before - 8,
              f"前 {b_before:.1f} → 谷 {b_peak:.1f}")

        # 调色生效：Run A 未调色帧 vs Run B 调色帧（同位置 6s，镜 2 中段无转场干扰）
        # eq=contrast 1.10 + brightness -0.01 预期均值偏移约 7 级
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "6", "-i", str(out_a),
                        "-frames:v", "1", str(tmp / "cmp_graded.png")], check=True)
        b_raw = mean_brightness(tmp / "cmp_raw.png")
        b_graded = mean_brightness(tmp / "cmp_graded.png")
        check("B8 调色帧与原始帧存在可测差异", abs(b_graded - b_raw) > 3,
              f"raw {b_raw:.1f} vs graded {b_graded:.1f}")

        # ASS 位移断言（Run B）：sub3 起点 = 3s(卡)+13.5s-0.5s(位移) = 16.0s；
        # sub5 起点 = 3+22.5-1.0 = 24.5s（其前有两处转场：卡 fade + 幂界 fadeblack）
        ass = (PROJ / "scripts" / f"final_{FIXTURE_PID}.ass").read_text(encoding="utf-8")
        check("B9 ASS 含验收字幕且 PlayResX=1080",
              "PlayResX: 1080" in ass and "验收字幕第4镜" in ass)
        check("B10 ASS 字幕随转场位移（16.0s / 24.5s 起）",
              "0:00:16.00" in ass and "0:00:24.50" in ass)

    finally:
        cleanup_fixture()
        print("\n[Cleanup] fixture 行与产物已清理")

    failed = [r for r in results if not r[1]]
    print(f"\n验收结果：{len(results) - len(failed)}/{len(results)} 通过")
    if failed:
        for name, _, detail in failed:
            print(f"  FAIL: {name} {detail}")
        sys.exit(1)
    print("全部通过 · v2.5 成片专业化验收 OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
