#!/usr/bin/env python3
"""
成片合成器 —— 「一键成片」的执行体（docs/architecture-v2.md §7.9）。

由 compose API（src/server/services/compose-service.ts）调用：
  python3 scripts/assemble-episode.py <projectId> [--allow-missing]

输入（全部来自服务端产物，直读 SQLite）：
  - 镜头成片 public/assets/clip_{clipId}.mp4（按 plannedMs 截取）
  - 配音轨 public/assets/voice_{clipId}.wav（按轨起止混音）
  - 字幕轨 track_items(kind='subtitle')（烧录 ASS，金句大字样式）
  - 片头卡：剧名 + 集号（PIL 绘制 → 缓推动态；集号缺省时仅剧名）

输出：public/assets/final_{projectId}.mp4（H.264 + AAC 竖版，自包含）
最后 stdout 行打印 JSON 结果：{"ok":true,"url":…,"clips":…,"durationSec":…}
失败打印 {"ok":false,"error":…} 并以非零码退出。
"""
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

PROJ = Path("/home/z/my-project")
ASSETS = PROJ / "public" / "assets"
FONT = Path("/usr/share/fonts/truetype/chinese/NotoSansSC-Bold.ttf")
ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Jinju,Noto Sans SC,58,&H00FFFFFF,&H00FFFFFF,&H00101010,&H88000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,80,1
Style: Card,Noto Sans SC,64,&H00FFFFFF,&H00FFFFFF,&H00101010,&H88000000,-1,0,0,0,100,100,0,0,1,3,1,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

TITLE_CARD_SECONDS = 3.0  # 片头卡时长（秒）


def fmt_ass_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int(seconds % 3600 // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def fail(msg: str) -> None:
    print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
    sys.exit(1)


def main() -> None:
    if len(sys.argv) < 2:
        fail("缺少参数：projectId")
    project_id = sys.argv[1]
    allow_missing = "--allow-missing" in sys.argv

    con = sqlite3.connect(PROJ / "db/custom.db")
    cur = con.cursor()

    project = cur.execute(
        "SELECT title, episodeNo FROM projects WHERE id=?",
        (project_id,),
    ).fetchone()
    if not project:
        fail(f"项目不存在: {project_id}")
    title, episode_no = project

    clips = cur.execute(
        '''SELECT id, "order", name, subtitle, plannedMs, mediaUrl, status
           FROM timeline_clips WHERE projectId=? ORDER BY "order"''',
        (project_id,),
    ).fetchall()
    if not clips:
        fail("镜头轨为空，请先完成流水线拆镜")
    subtitle_items = cur.execute(
        '''SELECT startMs, endMs, text FROM track_items
           WHERE projectId=? AND kind='subtitle' ORDER BY startMs''',
        (project_id,),
    ).fetchall()
    con.close()

    ready = [c for c in clips if c[5] and c[6] == "ready"]
    if len(ready) < len(clips) and not allow_missing:
        missing = len(clips) - len(ready)
        names = "、".join(c[2] for c in clips if not (c[5] and c[6] == "ready"))[:80]
        fail(f"尚有 {missing} 个镜头未出片：{names}")

    # —— 时间轴（可用镜头顺排，plannedMs 为节奏依据）——
    planned = {c[0]: (c[4] or 3000) for c in clips}
    timeline = []  # (clipId, startSec, durSec)
    cursor = 0.0
    for c in ready:
        dur = planned[c[0]] / 1000
        timeline.append((c[0], cursor, dur))
        cursor += dur
    body_seconds = cursor

    total = TITLE_CARD_SECONDS + body_seconds

    # —— ASS 字幕 ——
    card_label = (
        f"{title}\\N第 {episode_no} 集" if episode_no is not None else title
    )
    events = [
        f"Dialogue: 0,{fmt_ass_ts(0.4)},{fmt_ass_ts(TITLE_CARD_SECONDS - 0.1)},Card,,0,0,0,,"
        f"{{\\fad(300,300)}}{card_label}"
    ]
    for start_ms, end_ms, text in subtitle_items:
        # 字幕轨时间基于镜头时间轴（无片头卡），整体后移卡长
        events.append(
            f"Dialogue: 0,{fmt_ass_ts(TITLE_CARD_SECONDS + start_ms/1000)},"
            f"{fmt_ass_ts(TITLE_CARD_SECONDS + end_ms/1000)},Jinju,,0,0,0,,"
            f"{{\\fad(150,150)}}{text}"
        )
    ass_file = PROJ / "scripts" / f"final_{project_id}.ass"
    ass_file.write_text(ASS_HEADER + "\n".join(events) + "\n", encoding="utf-8")

    # —— 分段裁剪（统一 720x1280 / 30fps / h264）——
    seg_files = []
    tmp = Path("/tmp/assemble")
    tmp.mkdir(exist_ok=True)

    # 片头卡：剧名大字 + 缓推
    # 注意：zoompan 的 d 是「每输入帧生成的输出帧数」，必须单帧输入
    # （-loop 1 -t 3 会产生 90 帧输入 → 8100 帧输出的帧数爆炸，进程假死）
    card_png = tmp / "card.png"
    draw_card(str(card_png), title, episode_no)
    card_seg = tmp / "card.mp4"
    run([
        "ffmpeg", "-y", "-i", str(card_png),
        "-vf", "scale=720:1280,zoompan=z='1+0.0015*on':d=90:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=30",
        "-frames:v", "90",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast",
        "-an", str(card_seg),
    ])
    seg_files.append(card_seg)

    for clip_id, _, dur in timeline:
        src = ASSETS / f"clip_{clip_id}.mp4"
        seg = tmp / f"seg_{clip_id}.mp4"
        run([
            "ffmpeg", "-y", "-ss", "0", "-t", f"{dur:.3f}", "-i", str(src),
            "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast",
            "-an", str(seg),
        ])
        seg_files.append(seg)

    # —— 拼接 ——
    concat_list = tmp / "list.txt"
    concat_list.write_text(
        "\n".join(f"file '{f}'" for f in seg_files), encoding="utf-8"
    )
    body = tmp / "body.mp4"
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
        "-c", "copy", str(body),
    ])

    # —— 音轨：静音底 + 配音混入（时间轴整体后移片头卡长）——
    filters = []
    voice_inputs = []
    for clip_id, start_sec, _ in timeline:
        wav = ASSETS / f"voice_{clip_id}.wav"
        if not wav.exists():
            continue
        voice_inputs += ["-i", str(wav)]
        delay_ms = int((TITLE_CARD_SECONDS + start_sec) * 1000)
        idx = 1 + len(filters)  # 输入 0 是 body 视频
        filters.append(f"[{idx}:a]adelay={delay_ms}|{delay_ms}[v{idx}]")

    if filters:
        mix_in = "".join(f"[v{i}]" for i in range(1, 1 + len(filters)))
        audio_args = voice_inputs + [
            "-filter_complex",
            ";".join(filters) + f";{mix_in}amix=inputs={len(filters)}:normalize=0,apad=whole_dur={total:.2f}[aout]",
            "-map", "0:v", "-map", "[aout]",
            "-c:a", "aac", "-b:a", "128k", "-shortest",
        ]
    else:
        audio_args = ["-an"]

    # —— 烧录字幕 + 成片（产物自包含：public/assets/final_{projectId}.mp4）——
    ASSETS.mkdir(parents=True, exist_ok=True)
    out = ASSETS / f"final_{project_id}.mp4"
    run([
        "ffmpeg", "-y", "-i", str(body),
        *audio_args,
        "-vf", f"ass={ass_file}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium",
        "-crf", "21", "-movflags", "+faststart",
        str(out),
    ])
    if not out.exists() or out.stat().st_size < 10_000:
        fail("合成产物异常（文件缺失或过小）")

    result = {
        "ok": True,
        "url": f"/assets/{out.name}",
        "clips": len(timeline),
        "durationSec": round(total, 1),
        "withVoice": len(voice_inputs) > 0,
    }
    print(f"成片就绪: {out}")
    print(f"  镜头 {len(timeline)}/{len(clips)} · 配音 {len(voice_inputs)//2} 段 · 总长 {total:.1f}s")
    print(json.dumps(result, ensure_ascii=False))


def run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"ffmpeg 命令失败: {' '.join(cmd[:4])}... {r.stderr[-400:]}")


def draw_card(path: str, series_title: str, episode_no: int | None) -> None:
    from PIL import Image, ImageDraw, ImageFilter

    W, H = 1440, 2560  # 2x 超采样 → 缩到 720
    img = Image.new("RGB", (W, H))
    # 深色渐变底（低饱和蓝黑，压向片头神秘感）
    top = (12, 16, 34)
    bottom = (4, 6, 14)
    for y in range(H):
        t = y / H
        img.paste(
            tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)), (0, y, W, y + 1)
        )
    draw = ImageDraw.Draw(img)
    # 中央金色剧名
    big = ImageFontFor(300)
    tw = draw.textlength(series_title, font=big)
    draw.text(((W - tw) / 2, H * 0.40), series_title, font=big, fill=(224, 182, 106))
    if episode_no is not None:
        small = ImageFontFor(120)
        label = f"第 {episode_no} 集"
        sw = draw.textlength(label, font=small)
        draw.text(((W - sw) / 2, H * 0.40 + 380), label, font=small, fill=(210, 210, 216))
    # 装饰线
    draw.rectangle([(W - 520) / 2, H * 0.40 - 80, (W + 520) / 2, H * 0.40 - 70], fill=(224, 182, 106))
    img = img.resize((720, 1280), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    img.save(path)


def ImageFontFor(size: int):
    from PIL import ImageFont

    return ImageFont.truetype(str(FONT), size)


if __name__ == "__main__":
    main()
