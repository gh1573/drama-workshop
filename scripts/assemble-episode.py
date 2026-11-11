#!/usr/bin/env python3
"""
成片合成器 —— 「一键成片」的执行体（docs/architecture-v2.md §7.9）。

由 compose API（src/server/services/compose-service.ts）调用：
  python3 scripts/assemble-episode.py <projectId> [--allow-missing]
      [--loudnorm-i I --loudnorm-tp TP --loudnorm-lra LRA]
      [--bgm-volume V --bgm-duck-amount A]
音频参数由 L2 配置层（src/config/runtime.ts）读取后经 CLI 传入，脚本自身零硬编码：
  - 不传 loudnorm 参数 = 不做响度归一（v2.4.3 行为，回归无差）；
  - 传 loudnorm 参数 = 两遍法归一（先测量后线性归一，精准命中目标，增益恒定不抽泵）；
  - 不传 bgm 参数 = 不混 BGM（即使存在 bgm_{projectId}.* 文件）。

输入（全部来自服务端产物，直读 SQLite）：
  - 镜头成片 public/assets/clip_{clipId}.mp4（按 plannedMs 截取）
  - 配音轨 public/assets/voice_{clipId}.wav（按轨起止混音）
  - BGM 素材 public/assets/bgm_{projectId}.*（用户上传，循环铺底 + 对白侧链闪避）
  - 字幕轨 track_items(kind='subtitle')（烧录 ASS，金句大字样式）
  - 片头卡：剧名 + 集号（PIL 绘制 → 缓推动态；集号缺省时仅剧名）

输出：public/assets/final_{projectId}.mp4（H.264 + AAC 竖版，自包含）
最后 stdout 行打印 JSON 结果：{"ok":true,"url":…,"clips":…,"durationSec":…,"withVoice":…,"withBgm":…}
失败打印 {"ok":false,"error":…} 并以非零码退出。
"""
import argparse
import json
import re
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
    ap = argparse.ArgumentParser(description="剧集成片合成器（§7.9）")
    ap.add_argument("project_id")
    ap.add_argument("--allow-missing", action="store_true")
    ap.add_argument("--loudnorm-i", type=float, default=None, help="响度归一目标（LUFS）；不传 = 不归一")
    ap.add_argument("--loudnorm-tp", type=float, default=None, help="真峰值上限（dBTP）")
    ap.add_argument("--loudnorm-lra", type=float, default=None, help="响度范围（LU）")
    ap.add_argument("--bgm-volume", type=float, default=None, help="BGM 基础增益（线性 0~1）；不传 = 不混 BGM")
    ap.add_argument("--bgm-duck-amount", type=float, default=None, help="侧链闪避强度（0~1）")
    a = ap.parse_args()
    project_id = a.project_id
    allow_missing = a.allow_missing

    # 参数组完整性校验：成组传入才生效（防半配置静默降级）
    ln = (a.loudnorm_i, a.loudnorm_tp, a.loudnorm_lra)
    if any(v is not None for v in ln) and not all(v is not None for v in ln):
        fail("loudnorm 参数必须成组传入：--loudnorm-i / --loudnorm-tp / --loudnorm-lra")
    if (a.bgm_volume is None) != (a.bgm_duck_amount is None):
        fail("BGM 参数必须成组传入：--bgm-volume / --bgm-duck-amount")
    ln_i, ln_tp, ln_lra = ln
    bgm_volume, bgm_duck = a.bgm_volume, a.bgm_duck_amount

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

    # —— 音轨：配音混入（时间轴整体后移片头卡长）
    #     + BGM 循环铺底/对白侧链闪避 + 末级 EBU R128 响度归一（v2.4.4）——
    filters = []  # (输入序号, 延迟毫秒)
    voice_inputs = []
    for clip_id, start_sec, _ in timeline:
        wav = ASSETS / f"voice_{clip_id}.wav"
        if not wav.exists():
            continue
        voice_inputs += ["-i", str(wav)]
        delay_ms = int((TITLE_CARD_SECONDS + start_sec) * 1000)
        idx = 1 + len(filters)  # 输入 0 是 body 视频
        filters.append((idx, delay_ms))

    # BGM 素材：用户上传（同项目仅一份；版权用户自负，§11）
    bgm_file = None
    if bgm_volume is not None:
        for ext in ("mp3", "m4a", "aac", "wav", "ogg"):
            p = ASSETS / f"bgm_{project_id}.{ext}"
            if p.exists():
                bgm_file = p
                break

    # 统一音频格式（BGM/侧链/loudnorm 需同率同声道）
    FMT = "aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
    n_voice = len(filters)
    audio_inputs = list(voice_inputs)  # 配音输入排在视频之后（滤镜图的 1..n 序号与此对应）
    tail = ""
    last = None  # 最终混音节点标签

    if n_voice:
        for idx, delay_ms in filters:
            tail += f"[{idx}:a]adelay={delay_ms}|{delay_ms}[v{idx}];"
        mix_in = "".join(f"[v{i}]" for i in range(1, 1 + n_voice))
        tail += f"{mix_in}amix=inputs={n_voice}:normalize=0,apad=whole_dur={total:.2f}"
        if bgm_file or ln_i is not None:
            tail += f",{FMT}"
        tail += "[voiceMix]"
        if bgm_file:
            # BGM 输入排在全部配音输入之后；-stream_loop 循环铺满，atrim 截到全片长
            bgm_idx = 1 + n_voice
            audio_inputs += ["-stream_loop", "-1", "-i", str(bgm_file)]
            ratio = 1.0 + 9.0 * bgm_duck  # 闪避强度 0~1 → 压缩比 1~10
            tail += (
                f";[{bgm_idx}:a]atrim=0:{total:.2f},asetpts=PTS-STARTPTS,"
                f"volume={bgm_volume:.4f},{FMT}[bgmBase]"
                f";[voiceMix]asplit[voiceMain][voiceKey]"
                f";[bgmBase][voiceKey]sidechaincompress=threshold=0.02:ratio={ratio:.2f}"
                f":attack=20:release=400:makeup=1[bgmDucked]"
                f";[voiceMain][bgmDucked]amix=inputs=2:normalize=0[mixed]"
            )
            last = "mixed"
        else:
            last = "voiceMix"
    elif bgm_file:
        bgm_idx = 1
        audio_inputs += ["-stream_loop", "-1", "-i", str(bgm_file)]
        tail = (
            f"[{bgm_idx}:a]atrim=0:{total:.2f},asetpts=PTS-STARTPTS,"
            f"volume={bgm_volume:.4f},{FMT},apad=whole_dur={total:.2f}[mixed]"
        )
        last = "mixed"

    # —— 末级响度归一（EBU R128 两遍法，v2.4.4）——
    # 第一遍仅解码音频混音轨测量（秒级，不碰视频）；第二遍以实测值线性归一（增益恒定不抽泵）。
    if last is not None and ln_i is not None:
        measure_tail = (
            tail + f";[{last}]loudnorm=I={ln_i:g}:TP={ln_tp:g}:LRA={ln_lra:g}"
            f":print_format=json[lnOut]"
        )
        measured = measure_loudnorm(
            ["ffmpeg", "-nostats", "-i", str(body), *audio_inputs,
             "-filter_complex", measure_tail, "-map", "[lnOut]", "-f", "null", "-"]
        )
        if measured is None:
            fail("loudnorm 测量遍失败（无法取得实测响度）")
        # 工程保障（实测踩坑后修正，详见 §10 v2.4.4）：
        # ① 目标 LRA 取 max(配置值, 实测 LRA)：实测超标时 ffmpeg 会静默回落动态模式（抽泵）；
        # ② 第二遍 TP 参数按预估增益抬高（上限 0dBFS）：loudnorm 线性模式内部仍会按
        #    自身 TP 参数回撤增益（后置限幅器无法弥补，实测 -18.8 LUFS 欠达标）；
        # ③ 真峰值由后置 alimiter（阈值=TP 目标）强制执行。
        try:
            lra_eff = max(ln_lra, float(measured["input_lra"]))
        except ValueError:
            lra_eff = ln_lra
        gain_est = max(0.0, ln_i - float(measured["input_i"]))
        pass2_tp = min(0.0, ln_tp + gain_est)
        limiter_limit = 10 ** (ln_tp / 20)  # dBTP → 线性幅度（-1.5dBTP ≈ 0.8414）
        tail += (
            f";[{last}]loudnorm=I={ln_i:g}:TP={pass2_tp:g}:LRA={lra_eff:g}"
            f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
            f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
            f":linear=true,"
            f"alimiter=limit={limiter_limit:.4f}:attack=5:release=80:level=0,"
            f"aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]"
        )
        audio_args = [
            *audio_inputs,
            "-filter_complex", tail,
            "-map", "0:v", "-map", "[aout]",
            "-c:a", "aac", "-b:a", "192k", "-shortest",
        ]
        ln_label = " · 响度已归一（两遍线性，实测入-目标出）"
    elif last is not None:
        # 未传 loudnorm 参数：仅混音不归一（无 BGM 时与 v2.4.3 链路等价）
        tail += f";[{last}]anull[aout]"
        audio_args = [
            *audio_inputs,
            "-filter_complex", tail,
            "-map", "0:v", "-map", "[aout]",
            "-c:a", "aac", "-b:a", "128k", "-shortest",
        ]
        ln_label = ""
    else:
        audio_args = ["-an"]  # 无配音且无 BGM：无声视频（能力不回退）
        ln_label = ""

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
        "withVoice": n_voice > 0,
        "withBgm": bgm_file is not None,
    }
    bgm_label = " · BGM 已混入" if bgm_file is not None else ""
    print(f"成片就绪: {out}")
    print(f"  镜头 {len(timeline)}/{len(clips)} · 配音 {n_voice} 段 · 总长 {total:.1f}s{bgm_label}{ln_label}")
    print(json.dumps(result, ensure_ascii=False))


def run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"ffmpeg 命令失败: {' '.join(cmd[:4])}... {r.stderr[-400:]}")


def measure_loudnorm(cmd: list[str]) -> dict[str, str] | None:
    """执行 loudnorm 测量遍，从 stderr 解析 print_format=json 的实测值。

    返回 {input_i, input_tp, input_lra, input_thresh}（字符串，保留原精度）；
    测量失败（非零退出/JSON 缺失）返回 None，由调用方 fail。
    """
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return None
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    keys = ("input_i", "input_tp", "input_lra", "input_thresh")
    if not all(k in data for k in keys):
        return None
    return {k: str(data[k]) for k in keys}


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
