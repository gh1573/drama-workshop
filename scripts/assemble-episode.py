#!/usr/bin/env python3
"""
成片合成器 —— 后期成包的 CLI 版本（对应流水线第五阶段 postproduction 的成片出口）。

输入（全部来自服务端产物）：
  - 镜头成片 public/assets/clip_{clipId}.mp4（每镜 5s 竖版，按 plannedMs 截取）
  - 配音轨 public/assets/voice_{clipId}.wav（金句镜头，按轨起止混音）
  - 字幕轨（track_items subtitle / 镜头 subtitle 字段，烧录 ASS）
  - 片头卡：剧名 + 集号（PIL 绘制 → 缓推动态）

输出：download/series/{seriesTitle}_EP{N}.mp4（H.264 + AAC 竖版）

用法：python3 scripts/assemble-episode.py <projectId> [--allow-missing]
"""
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

PROJ = Path("/home/z/my-project")
ASSETS = PROJ / "public" / "assets"
OUT_DIR = PROJ / "download" / "series"
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


def fmt_ass_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int(seconds % 3600 // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def main() -> None:
    project_id = sys.argv[1]
    allow_missing = "--allow-missing" in sys.argv
    con = sqlite3.connect(PROJ / "db/custom.db")
    cur = con.cursor()

    project = cur.execute(
        "SELECT title, seriesId, episodeNo FROM projects WHERE id=?",
        (project_id,),
    ).fetchone()
    if not project:
        sys.exit(f"项目不存在: {project_id}")
    title, series_id, episode_no = project
    series_title = (
        cur.execute("SELECT title FROM series WHERE id=?", (series_id,)).fetchone()
        if series_id
        else None
    )
    series_title = series_title[0] if series_title else title

    clips = cur.execute(
        '''SELECT id, "order", name, subtitle, plannedMs, mediaUrl, status
           FROM timeline_clips WHERE projectId=? ORDER BY "order"''',
        (project_id,),
    ).fetchall()
    voice_items = cur.execute(
        '''SELECT clipId, startMs, endMs, style FROM track_items
           WHERE projectId=? AND kind='voiceover' ''',
        (project_id,),
    ).fetchall()
    subtitle_items = cur.execute(
        '''SELECT startMs, endMs, text FROM track_items
           WHERE projectId=? AND kind='subtitle' ORDER BY startMs''',
        (project_id,),
    ).fetchall()
    con.close()

    ready = [c for c in clips if c[5] and c[6] == "ready"]
    if len(ready) < len(clips) and not allow_missing:
        missing = len(clips) - len(ready)
        sys.exit(f"尚有 {missing} 个镜头未出片，加 --allow-missing 可先出测试版")
    usable = ready if allow_missing else clips

    # —— 时间轴（可用镜头顺排，plannedMs 为节奏依据）——
    planned = {c[0]: (c[4] or 3000) for c in clips}
    timeline = []  # (clipId, startSec, durSec)
    cursor = 0.0
    for c in usable:
        dur = planned[c[0]] / 1000
        timeline.append((c[0], cursor, dur))
        cursor += dur
    body_seconds = cursor

    # —— 片头卡（剧名 + 集号，3s）——
    card_seconds = 3.0
    total = card_seconds + body_seconds

    # —— ASS 字幕 ——
    events = [
        f"Dialogue: 0,{fmt_ass_ts(0.4)},{fmt_ass_ts(2.9)},Card,,0,0,0,,"
        f"{{\\fad(300,300)}}{series_title}\\N第 {episode_no} 集"
    ]
    for start_ms, end_ms, text in subtitle_items:
        # 字幕轨时间基于镜头时间轴（无片头卡），整体后移卡长
        events.append(
            f"Dialogue: 0,{fmt_ass_ts(card_seconds + start_ms/1000)},"
            f"{fmt_ass_ts(card_seconds + end_ms/1000)},Jinju,,0,0,0,,"
            f"{{\\fad(150,150)}}{text}"
        )
    ass_file = PROJ / "scripts" / f"ep_{episode_no}.ass"
    ass_file.write_text(ASS_HEADER + "\n".join(events) + "\n", encoding="utf-8")

    # —— 分段裁剪（统一 720x1280 / 30fps / h264）——
    seg_files = []
    tmp = Path("/tmp/assemble")
    tmp.mkdir(exist_ok=True)

    # 片头卡：剧名大字 + 底部剧名水印由 ASS 承担，画面用纯色渐变 + 缓推
    card_png = tmp / "card.png"
    draw_card(str(card_png), series_title, episode_no)
    card_seg = tmp / "card.mp4"
    run([
        "ffmpeg", "-y", "-loop", "1", "-t", str(card_seconds),
        "-i", str(card_png),
        "-vf", "scale=720:1280,zoompan=z='1+0.0015*on':d=90:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=30",
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
        delay_ms = int((card_seconds + start_sec) * 1000)
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

    # —— 烧录字幕 + 成片 ——
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{series_title}_EP{episode_no}.mp4"
    run([
        "ffmpeg", "-y", "-i", str(body),
        *audio_args,
        "-vf", f"ass={ass_file}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium",
        "-crf", "21", "-movflags", "+faststart",
        str(out),
    ])
    print(f"成片就绪: {out}")
    print(f"  镜头 {len(timeline)}/{len(clips)} · 配音 {len(voice_inputs)//2} 段 · 总长 {total:.1f}s")


def run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-1500:])
        sys.exit(f"命令失败: {' '.join(cmd[:4])}...")


def draw_card(path: str, series_title: str, episode_no: int) -> None:
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
    big = ImageFont.truetype(str(FONT), 260)
    tw = draw.textlength(series_title, font=big)
    draw.text(((W - tw) / 2, H * 0.38), series_title, font=big, fill=(224, 182, 106))
    # 集号
    small = ImageFont.truetype(str(FONT), 120)
    label = f"第 {episode_no} 集"
    sw = draw.textlength(label, font=small)
    draw.text(((W - sw) / 2, H * 0.38 + 380), label, font=small, fill=(210, 210, 216))
    # 装饰线
    draw.rectangle([(W - 520) / 2, H * 0.38 - 80, (W + 520) / 2, H * 0.38 - 70], fill=(224, 182, 106))
    img = img.resize((720, 1280), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    img.save(path)


if __name__ == "__main__":
    main()
