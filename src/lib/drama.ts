/**
 * 剧集智能创编工坊 (DRAMA STUDIO) — 核心数据层
 * Schema 与原版导出的 drama_project_*.json 结构对齐 (v1.2.0)
 */

export type NarrativeFunction = "hook" | "climax" | "cliffhanger";

export interface GenrePreset {
  id: string;
  /** 完整名称，如：战神逆袭 · 龙王归来 */
  name: string;
  /** 卡片短名 */
  short: string;
  badge: string;
  icon: string;
  /** 黄金前 3 秒钩子策略 */
  hookTactic: string;
  /** 建议配乐音效 */
  musicMood: string;
  /** 英文影调 Prompt（AI 视频风格锚点） */
  tonePrompt: string;
  /** UI 点缀色 */
  gradient: string;
  ring: string;
  text: string;
  /** 示例梗概（一键填充） */
  sampleSynopsis: string;
}

export interface ModelConfig {
  videoModel: string;
  durationSeconds: number;
  resolution: string;
  scriptThinkingLevel: "low" | "medium" | "high";
  enablePromptEnhance: boolean;
}

export interface StoryBeat {
  index: number;
  actTitle: string;
  narrativeFunction: NarrativeFunction;
  pacingNote: string;
  description: string;
  dialogueSubtitle: string;
  cameraMovement: string;
  promptGuidance: string;
}

export interface DramaProjectData {
  project: {
    title: string;
    version: string;
    exportedAt: string;
    genre: {
      id: string;
      name: string;
      badge: string;
      hookTactic: string;
      musicMood: string;
      tonePrompt: string;
    };
    aspectRatio: string;
    synopsis: string;
    modelConfig: ModelConfig;
  };
  storyBeats: StoryBeat[];
  timelineClips: unknown[];
  statistics: {
    totalBeats: number;
    totalClips: number;
    hasSynthesizedOutput: boolean;
  };
}

/** 运镜库（枚举值 → 中文机位说明），比原版单一 push 更丰富 */
export const CAMERA_MOVEMENTS: Record<string, string> = {
  push: "快速推近特写",
  pull: "缓缓拉远",
  handheld: "手持跟拍",
  whip_pan: "快速甩镜",
  dolly_zoom: "希区柯克变焦",
  crane_up: "升降上摇",
  orbit: "环绕运镜",
  low_angle_tracking: "低角度跟拍",
  top_down: "俯拍全景",
  static_close: "固定特写",
};

export const NARRATIVE_META: Record<
  NarrativeFunction,
  { actNo: string; tag: string; label: string }
> = {
  hook: { actNo: "第一幕", tag: "黄金开头 Hook", label: "极致冲突" },
  climax: { actNo: "第二幕", tag: "绝地反转 Clash", label: "身份揭晓" },
  cliffhanger: { actNo: "第三幕", tag: "卡点留钩 Cliffhanger", label: "致命悬念" },
};

/** 本地时间戳，格式 2026/11/10 13:58:19 */
export function formatLocalTime(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 组装与原版 schema 完全对齐的工程 JSON */
export function buildProjectJson(
  genre: GenrePreset,
  synopsis: string,
  modelConfig: ModelConfig,
  beats: StoryBeat[]
): DramaProjectData {
  return {
    project: {
      title: "剧集智能创编工坊 - 短剧工程",
      version: "1.2.0",
      exportedAt: new Date().toISOString(),
      genre: {
        id: genre.id,
        name: genre.name,
        badge: genre.badge,
        hookTactic: genre.hookTactic,
        musicMood: genre.musicMood,
        tonePrompt: genre.tonePrompt,
      },
      aspectRatio: "9:16",
      synopsis: synopsis.trim(),
      modelConfig,
    },
    storyBeats: beats,
    timelineClips: [],
    statistics: {
      totalBeats: beats.length,
      totalClips: 0,
      hasSynthesizedOutput: false,
    },
  };
}

/** 生成与原版完全对齐的 Markdown 制作清单 */
export function buildMarkdown(project: DramaProjectData): string {
  const p = project.project;
  const lines: string[] = [];

  lines.push("# 🎬 《剧集智能创编工坊》分镜制作与录音清单");
  lines.push("");
  lines.push(`> 导出时间：${formatLocalTime(new Date(p.exportedAt))}  `);
  lines.push(`> 题材类型：**${p.genre.name}**（${p.genre.badge}）  `);
  lines.push(`> 画幅比例：**${p.aspectRatio} 竖屏短剧**  `);
  lines.push(
    `> AI 视频基模：**${p.modelConfig.videoModel}** (${p.modelConfig.durationSeconds}s / ${p.modelConfig.resolution})  `
  );
  lines.push(`> 建议配乐音效：${p.genre.musicMood}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 📖 核心剧情梗概");
  lines.push(p.synopsis);
  lines.push("");
  lines.push("");
  lines.push("## ⚡ 创作破局技与钩子设定");
  lines.push(`- **黄金前3秒抓人策略**：${p.genre.hookTactic}`);
  lines.push(`- **画面影调 Prompt**：\`${p.genre.tonePrompt}\``);
  lines.push("");
  lines.push("");
  lines.push("## 📋 三幕叙事与分镜详单");
  lines.push("");

  for (const beat of project.storyBeats) {
    lines.push(`### 【第 ${pad2(beat.index)} 幕】${beat.actTitle}`);
    lines.push(`- **节奏要求**：${beat.pacingNote}`);
    lines.push(
      `- **运镜机位**：${CAMERA_MOVEMENTS[beat.cameraMovement] ?? beat.cameraMovement}`
    );
    lines.push(`- **情节画面**：${beat.description}`);
    lines.push(`- **核心台词金句 (字幕)**：> 💬 **${beat.dialogueSubtitle}**`);
    lines.push(`- **画面提示补充**：${beat.promptGuidance}`);
    lines.push(`- **镜头产出状态**：⏳ 待生成`);
    lines.push("");
    lines.push("");
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`## 🎞️ 镜头轨素材排布 (${project.timelineClips.length} 个片段)`);
  lines.push("");
  lines.push(
    "| 镜头序号 | 镜头名称 | 关联节拍 / 角色 | 台词字幕 | 媒体格式 |"
  );
  lines.push("| :--- | :--- | :--- | :--- | :--- |");
  for (const clip of project.timelineClips) {
    const c = clip as Record<string, string>;
    lines.push(
      `| ${c.no ?? ""} | ${c.name ?? ""} | ${c.beat ?? ""} | ${c.subtitle ?? ""} | ${c.format ?? ""} |`
    );
  }
  lines.push("");
  lines.push("");
  lines.push("---");
  lines.push("*制作团队：剧集智能创编工坊 (DRAMA STUDIO)*");

  return lines.join("\n");
}

/** 触发浏览器下载 */
export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
