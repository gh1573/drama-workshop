import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { RouteError } from "@/lib/api-utils";
import { getProject, exportProject } from "./project-service";
import type { ClipData, ProjectDetail, TrackItemDTO } from "@/lib/drama";

/**
 * 制作包服务（v2.9）—— 「一键下载制作包」的产品化交付。
 *
 * 产品动机：成片 MP4 只是交付物之一；工作室拿去二次剪辑/投流的刚需是
 * 完整制作包——镜头素材、定妆图、分镜表、字幕、配音、工程档案。
 *
 * 实现约束（零依赖）：
 * - ZIP 用 node:zlib deflateRaw + 手写 local header / central directory，
 *   不引入第三方压缩库（§3 原则 3：任何一层替换实现不惊动相邻层）；
 * - 只读取本仓库 public/ 下的产物文件，URL 白名单 /assets/ 前缀防穿越。
 *
 * 包结构（目录前缀保序，交付物在前）：
 *   01_成片/xxx.mp4            —— Project.finalVideoUrl
 *   02_镜头素材/镜NN.mp4        —— 就绪镜头的 mediaUrl（二次剪辑素材）
 *   03_定妆图/[类型]_名称.png   —— 资产库定妆图（跨集复用的脸）
 *   04_配音/镜NN.wav            —— voiceover 轨产物
 *   05_文档/分镜表.md           —— 场次 × 镜号 × 景别运镜 × 台词 × 能量 × 提示词
 *   05_文档/字幕.srt            —— 字幕轨（通用格式，剪映/PR 可直接导入）
 *   06_工程档案.json            —— v1.2.0 兼容导出（全量数据）
 */

/* ---------------- ZIP（零依赖，store/deflate） ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** 固定 DOS 时间戳 2026-01-01 00:00（包内容不要求文件 mtime 语义） */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const deflated = deflateRawSync(e.data, { level: 6 });
    const useDeflate = deflated.length < e.data.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? deflated : e.data;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 文件名
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18); // compressed size
    local.writeUInt32LE(e.data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    localParts.push(local, nameBuf, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk start
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offset, 42); // local header offset
    centralParts.push(cd, nameBuf);

    offset += 30 + nameBuf.length + payload.length;
  }

  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, eocd]);
}

/* ---------------- 产物文件读取（/assets 白名单） ---------------- */

function readPublicAsset(url: string | null | undefined): Buffer | null {
  if (!url || !url.startsWith("/assets/")) return null;
  const rel = url.replace(/^\//, "");
  if (rel.includes("..")) return null;
  const file = path.join(process.cwd(), "public", rel);
  if (!existsSync(file)) return null;
  try {
    return readFileSync(file);
  } catch {
    return null;
  }
}

/** 文件名安全化：去路径分隔符与非法字符 */
function safeName(s: string): string {
  return (s || "untitled").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 60);
}

/* ---------------- 分镜表 Markdown ---------------- */

const KIND_LABEL: Record<string, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

function buildStoryboardMd(detail: ProjectDetail): string {
  const clipsByBeat = new Map<number, ClipData[]>();
  for (const c of detail.timelineClips) {
    const list = clipsByBeat.get(c.beatIndex) ?? [];
    list.push(c);
    clipsByBeat.set(c.beatIndex, list);
  }
  const totalSec = Math.round(
    detail.timelineClips.reduce((s, c) => s + (c.plannedMs ?? 0), 0) / 1000
  );

  const lines: string[] = [
    `# ${detail.title} · 分镜表`,
    "",
    `> 题材：${detail.genre.name}（${detail.genre.badge}）｜ 画幅 ${detail.aspectRatio} ｜ ${detail.storyBeats.length} 场 ${detail.timelineClips.length} 镜 ｜ 预计总时长 ${totalSec}s`,
    "",
    `> 梗概：${detail.synopsis}`,
    "",
  ];

  for (const b of detail.storyBeats) {
    lines.push(`## 第 ${b.index + 1} 场 · ${b.actTitle}`, "");
    if (b.description) lines.push(b.description, "");
    if (b.pacingNote) lines.push(`> 节奏：${b.pacingNote}`, "");
    const shots = (clipsByBeat.get(b.index) ?? []).sort((a, b2) => a.order - b2.order);
    if (!shots.length) continue;
    lines.push(
      "| 镜号 | 景别 | 运镜 | 台词字幕 | 能量 | 计划时长 |",
      "| --- | --- | --- | --- | --- | --- |"
    );
    for (const s of shots) {
      const cell = (v: string | null | undefined) => (v ?? "—").replace(/\|/g, "\\|");
      lines.push(
        `| ${cell(s.name)} | ${cell(s.shotSize)} | ${cell(s.cameraMovement)} | ${cell(
          s.subtitle
        )} | ${s.energy ?? "—"} | ${s.plannedMs ? `${(s.plannedMs / 1000).toFixed(1)}s` : "—"} |`
      );
    }
    lines.push("");
    for (const s of shots) {
      if (s.finalPrompt) {
        lines.push(`**${s.name} · 画面提示词**`, "", "```text", s.finalPrompt, "", "```", "");
      }
    }
  }
  return lines.join("\n");
}

/* ---------------- 字幕 SRT ---------------- */

function msToSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const f = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(f, 3)}`;
}

function buildSrt(tracks: TrackItemDTO[]): string {
  const subs = tracks
    .filter((t) => t.kind === "subtitle" && t.text)
    .sort((a, b) => a.startMs - b.startMs);
  return subs
    .map((t, i) => `${i + 1}\n${msToSrtTime(t.startMs)} --> ${msToSrtTime(t.endMs)}\n${t.text}\n`)
    .join("\n");
}

/* ---------------- 制作包主入口 ---------------- */

export async function buildProductionPackage(projectId: string): Promise<{
  buffer: Buffer;
  filename: string;
  fileCount: number;
}> {
  const detail = await getProject(projectId);

  const entries: ZipEntry[] = [];
  const push = (name: string, data: Buffer | null) => {
    if (data && data.length > 0) entries.push({ name, data });
  };

  // 01 成片
  if (detail.finalVideoUrl) {
    push(
      `01_成片/${safeName(detail.title)}.mp4`,
      readPublicAsset(detail.finalVideoUrl)
    );
  }

  // 02 镜头素材（就绪镜头，二次剪辑用）
  const sortedClips = [...detail.timelineClips].sort((a, b) => a.order - b.order);
  const clipIndex = new Map<string, number>();
  sortedClips.forEach((c, i) => clipIndex.set(c.id, i + 1));
  for (const c of sortedClips) {
    if (c.mediaUrl) {
      push(
        `02_镜头素材/镜${String(clipIndex.get(c.id)).padStart(2, "0")}_${safeName(c.name)}${
          path.extname(c.mediaUrl) || ".mp4"
        }`,
        readPublicAsset(c.mediaUrl)
      );
    }
  }

  // 03 定妆图
  for (const a of detail.assets) {
    if (a.portraitUrl) {
      push(
        `03_定妆图/${KIND_LABEL[a.kind] ?? a.kind}_${safeName(a.name)}${path.extname(
          a.portraitUrl
        ) || ".png"}`,
        readPublicAsset(a.portraitUrl)
      );
    }
  }

  // 04 配音（voiceover 轨产物）
  for (const t of detail.tracks) {
    if (t.kind !== "voiceover") continue;
    const url = (t.style as { url?: string } | null)?.url;
    if (!url) continue;
    const clipNo = t.clipId ? clipIndex.get(t.clipId) : undefined;
    push(
      `04_配音/镜${String(clipNo ?? 0).padStart(2, "0")}_${safeName(t.text).slice(0, 20)}.wav`,
      readPublicAsset(url)
    );
  }

  // 05 文档：分镜表 + 字幕
  push("05_文档/分镜表.md", Buffer.from(buildStoryboardMd(detail), "utf8"));
  const srt = buildSrt(detail.tracks);
  if (srt) push("05_文档/字幕.srt", Buffer.from(srt, "utf8"));

  // 06 工程档案（v1.2.0 兼容全量导出）
  push(
    "06_工程档案.json",
    Buffer.from(JSON.stringify(await exportProject(projectId), null, 2), "utf8")
  );

  if (entries.length === 0) {
    throw new RouteError("当前项目暂无可打包的产物（先开机生产）", 422);
  }

  const buffer = buildZip(entries);
  return {
    buffer,
    filename: `${safeName(detail.title)}-制作包.zip`,
    fileCount: entries.length,
  };
}
