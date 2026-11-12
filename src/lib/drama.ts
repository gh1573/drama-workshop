/**
 * 剧集智能创编工坊 (DRAMA STUDIO) — 核心数据层
 * Schema 与原版导出的 drama_project_*.json 结构对齐 (v1.2.0)
 */

/**
 * 场次叙事功能（v2.7「场次化剧本」：取代固定三幕节拍）：
 * - hook 开场钩子（首场硬性要求，黄金 3 秒）
 * - buildup 冲突升级（中段可选）
 * - twist 身份反转（中段可选）
 * - climax 情绪顶点（中段可选；旧数据兼存）
 * - cliffhanger 卡点留钩（末场硬性要求，连载钩子）
 */
export type NarrativeFunction =
  | "hook"
  | "buildup"
  | "twist"
  | "climax"
  | "cliffhanger";

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
  /** 示例梗概（一键填充） */
  sampleSynopsis: string;
}

/**
 * §7.13 唯一品牌渐变（v2.6 收口）：全站仅此一条彩色渐变，
 * 用于 logo / 主 CTA / 题材选中态 / 题材徽标。
 * 题材身份 = 图标 + 文案，不再持有各自配色
 * （v2.5 前每题材一套渐变，8 套色卡是首页色彩失控主源头）。
 */
export const BRAND_GRADIENT =
  "from-red-600 via-rose-600 to-amber-500";

export interface ModelConfig {
  videoModel: string;
  durationSeconds: number;
  resolution: string;
  scriptThinkingLevel: "low" | "medium" | "high";
  enablePromptEnhance: boolean;
}

export interface StoryBeat {
  index: number;
  /** 场次标题（编剧自拟，如「婚书碎地」；旧数据为「第 N 幕：…」格式，兼容渲染） */
  actTitle: string;
  narrativeFunction: NarrativeFunction;
  pacingNote: string;
  description: string;
  dialogueSubtitle: string;
  cameraMovement: string;
  promptGuidance: string;
  /** —— v2：场次级情绪能量（拆镜阶段产出，可人工修正） —— */
  energyStart?: number | null;
  energyEnd?: number | null;
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
  /** —— v2 可选扩展段（旧消费者忽略未知字段即可无损消费） —— */
  assets?: AssetExportItem[];
  tracks?: {
    subtitle: TrackItemDTO[];
    sfx: TrackItemDTO[];
    bgm: TrackItemDTO[];
  };
  energyCurve?: EnergyCurvePoint[];
}

/** 导出用资产条目（与原版 v1.2.0 schema 向后兼容的可选段） */
export interface AssetExportItem {
  kind: AssetKind;
  name: string;
  lockedAppearance: string;
  visualAnchor: string;
  portraitUrl?: string;
  refCount?: number;
}

/**
 * 运镜库（枚举值 → 中文机位说明 + 英文生成 Prompt）。
 *
 * 摄影组专业规范（v2.8.2）：运镜 = 运动语义 + 执行设备 + 受控度。
 * 真实剧组防抖靠设备（轨道/摇臂/斯坦尼康），不是删掉手持——手持、
 * 甩镜、荷兰倾斜是正当的电影技法，语义保留，但 prompt 必须写明执行
 * 设备与受控度，让基模生成「有意图的运镜」而非「意外抖动」：
 * - 推拉 → dolly（轨道车，天然稳定）
 * - 升降/俯拍 → crane/jib（摇臂）
 * - 环绕 → steadicam/gimbal（稳定器环绕）
 * - 固定/横摇 → locked-off tripod（三脚架）
 * - 手持 → controlled handheld（受控手持，幅度 subtle，风格化选择）
 * - 甩镜 → precise whip pan（精准甩镜，单条完成，受控运动模糊）
 * key 保持不变以兼容存量项目数据。
 */
export const CAMERA_MOVEMENTS: Record<
  string,
  { label: string; prompt: string }
> = {
  push: { label: "快速推近特写", prompt: "fast dolly push-in to close-up, aggressive framing" },
  pull: { label: "极速拉远全景", prompt: "fast dolly pull-back revealing full scene scale" },
  handheld: { label: "手持跟拍", prompt: "controlled handheld camera, subtle organic sway, urgent and immersive, shot by experienced operator" },
  whip_pan: { label: "甩镜转场", prompt: "precise whip pan, controlled fast swing with clean motion blur, single take" },
  dolly_zoom: { label: "希区柯克变焦", prompt: "dolly zoom vertigo effect, background warps while subject stays locked" },
  crane_up: { label: "摇臂升降", prompt: "crane jib rising overhead reveal" },
  orbit: { label: "360°环绕运镜", prompt: "steadicam orbital arc circling the subject in full circle" },
  low_angle_tracking: { label: "低角度仰拍跟拍", prompt: "low-angle dolly tracking shot gliding forward, dominant and imposing" },
  top_down: { label: "摇臂俯瞰", prompt: "overhead crane shot, bird's eye view, god-like overview" },
  dutch_tilt: { label: "荷兰倾斜", prompt: "intentional dutch tilt, canted-angle composition, dramatic unease, steady frame" },
  static_close: { label: "固定机位特写", prompt: "locked-off tripod close-up, tense stillness" },
  pan_horizontal: { label: "凌厉横摇", prompt: "crisp tripod pan scanning across the crowd" },
};

/** 运镜中文说明（兼容旧引用） */
export function cameraLabel(movement: string): string {
  return CAMERA_MOVEMENTS[movement]?.label ?? movement;
}

/**
 * 场次功能运镜池（v2.7：按叙事功能结构性分配机位调度，防止同质化）：
 * - hook：锁定/冲击类，3 秒内抓住眼球
 * - buildup：跟拍/压迫类，把冲突逐层推高（手持临场感是正当选择）
 * - twist：揭示/颠覆类，配合身份反转的尺度变化
 * - climax：排场/压迫类，展现顶点的震撞力
 * - cliffhanger：炫技/悬念类，制造意犹未尽的离场感
 * 池首位是 LLM 给错时的回退默认位，放该功能最通用的机位（v2.8.2）；
 * 池内成员保持专业多样性，风格化机位（手持/甩镜）保留在后位。
 */
export const ACT_MOVEMENT_POOLS: Record<NarrativeFunction, string[]> = {
  hook: ["push", "static_close", "dutch_tilt", "whip_pan", "handheld"],
  buildup: ["push", "pan_horizontal", "handheld", "low_angle_tracking"],
  twist: ["pull", "top_down", "dutch_tilt", "whip_pan"],
  climax: ["pull", "low_angle_tracking", "top_down", "pan_horizontal", "orbit"],
  cliffhanger: ["dolly_zoom", "crane_up", "orbit", "top_down"],
};

/** 景别库（分镜拆解用） */
export const SHOT_SIZES = [
  "远景",
  "全景",
  "中景",
  "近景",
  "特写",
  "大特写",
] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];

/**
 * 景别 → 英文电影术语映射（v2.8.2）：SHOT_SIZES 是面向编剧/导演的中文
 * 行话，但视频基模只懂英文电影术语——中文景别直拼英文 prompt 基模
 * 无法消费，必须在此完成确定性映射（prompt-engine 消费）。
 */
export const SHOT_SIZE_PROMPTS: Record<ShotSize, string> = {
  远景: "extreme long shot",
  全景: "wide full shot",
  中景: "medium shot",
  近景: "medium close-up",
  特写: "close-up",
  大特写: "extreme close-up",
};

/** 场次叙事功能 → 产品语言（tag 徽标 / label 短名；v2.7 不再持有 actNo——
 *  场次号由 index 动态生成，同一功能可出现在任意中段位置） */
export const NARRATIVE_META: Record<
  NarrativeFunction,
  { tag: string; label: string }
> = {
  hook: { tag: "开场钩子 Hook", label: "钩子" },
  buildup: { tag: "冲突升级 Buildup", label: "升级" },
  twist: { tag: "身份反转 Twist", label: "反转" },
  climax: { tag: "情绪顶点 Climax", label: "顶点" },
  cliffhanger: { tag: "卡点留钩 Cliffhanger", label: "留钩" },
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
  lines.push("## 📋 场次叙事与分镜详单");
  lines.push("");

  for (const beat of project.storyBeats) {
    lines.push(`### 【场 ${pad2(beat.index)}】${beat.actTitle}（${NARRATIVE_META[beat.narrativeFunction]?.tag ?? beat.narrativeFunction}）`);
    lines.push(`- **节奏要求**：${beat.pacingNote}`);
    lines.push(
      `- **运镜机位**：${cameraLabel(beat.cameraMovement)}（\`${beat.cameraMovement}\` → ${CAMERA_MOVEMENTS[beat.cameraMovement]?.prompt ?? ""}）`
    );
    lines.push(`- **情节画面**：${beat.description}`);
    lines.push(`- **核心台词金句 (字幕)**：> 💬 **${beat.dialogueSubtitle}**`);
    lines.push(`- **画面提示补充**：${beat.promptGuidance}`);
    lines.push(`- **镜头产出状态**：⏳ 待生成`);
    lines.push("");
    lines.push("");
  }

  // —— v2：资产定妆表（一致性锚定的交付物） ——
  if (project.assets && project.assets.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`## 🎭 资产定妆表 (${project.assets.length} 项 · 跨镜头一致性锚定)`);
    lines.push("");
    lines.push("| 类型 | 名称 | 锁定外观（中文） | 视觉锚点（英文） | 引用镜头数 | 定妆照 |");
    lines.push("| :--- | :--- | :--- | :--- | :--- | :--- |");
    const kindLabel: Record<string, string> = {
      character: "角色",
      scene: "场景",
      prop: "道具",
    };
    for (const a of project.assets) {
      lines.push(
        `| ${kindLabel[a.kind] ?? a.kind} | **${a.name}** | ${a.lockedAppearance} | \`${a.visualAnchor}\` | ${a.refCount ?? 0} | ${a.portraitUrl ? "✅ 已定妆" : "⏳ 未定妆"} |`
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`## 🎞️ 镜头轨素材排布 (${project.timelineClips.length} 个片段)`);
  lines.push("");
  const hasBreakdown = project.timelineClips.some(
    (c) => (c as ClipData).shotSize || (c as ClipData).cameraMovement
  );
  if (hasBreakdown) {
    lines.push(
      "| 镜头序号 | 镜头名称 | 关联场次 | 景别 | 运镜机位 | 画面内容 | 台词字幕 | 计划时长 | 能量 | 音效 | 媒体格式 | 状态 |"
    );
    lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |");
    for (const clip of project.timelineClips) {
      const c = clip as Record<string, string & number>;
      const mv = c.cameraMovement
        ? `${cameraLabel(String(c.cameraMovement))}`
        : "—";
      lines.push(
        `| ${c.no ?? ""} | ${c.name ?? ""} | ${c.beatRef ?? ""} | ${c.shotSize ?? "—"} | ${mv} | ${c.visualDesc ?? "—"} | ${c.subtitle ?? ""} | ${c.plannedMs ? `${Math.round(c.plannedMs / 100) / 10}s` : "—"} | ${c.energy != null ? `${c.energy}` : "—"} | ${c.sfxHint ?? "—"} | ${c.format ?? ""} | ${c.status ?? ""} |`
      );
    }
  } else {
    lines.push(
      "| 镜头序号 | 镜头名称 | 关联场次 / 角色 | 台词字幕 | 媒体格式 |"
    );
    lines.push("| :--- | :--- | :--- | :--- | :--- |");
    for (const clip of project.timelineClips) {
      const c = clip as Record<string, string>;
      lines.push(
        `| ${c.no ?? ""} | ${c.name ?? ""} | ${c.beatRef ?? ""} | ${c.subtitle ?? ""} | ${c.format ?? ""} |`
      );
    }
  }
  lines.push("");
  lines.push("");

  // —— v2：三轨排布表（后期成包交付物） ——
  if (project.tracks) {
    const t = project.tracks;
    const fmtMs = (ms: number) => `${Math.round(ms / 100) / 10}s`;
    if (t.subtitle.length > 0 || t.sfx.length > 0 || t.bgm.length > 0) {
      lines.push("---");
      lines.push("");
      lines.push("## 🎼 后期三轨排布");
      lines.push("");
      lines.push("### 字幕轨（金句大字 / 关键词变色）");
      lines.push("| 入点 | 出点 | 字幕文本 | 样式 |");
      lines.push("| :--- | :--- | :--- | :--- |");
      for (const s of t.subtitle) {
        lines.push(
          `| ${fmtMs(s.startMs)} | ${fmtMs(s.endMs)} | ${s.text} | ${s.style ? JSON.stringify(s.style) : "—"} |`
        );
      }
      lines.push("");
      lines.push("### 音效轨（卡点音效）");
      lines.push("| 入点 | 出点 | 音效标签 |");
      lines.push("| :--- | :--- | :--- |");
      for (const s of t.sfx) {
        lines.push(`| ${fmtMs(s.startMs)} | ${fmtMs(s.endMs)} | ${s.text} |`);
      }
      lines.push("");
      lines.push("### 配乐轨（情绪分段）");
      lines.push("| 入点 | 出点 | 情绪标签 | 强度 |");
      lines.push("| :--- | :--- | :--- | :--- |");
      for (const s of t.bgm) {
        const intensity =
          s.style && typeof s.style === "object" && "intensity" in s.style
            ? String((s.style as { intensity: number }).intensity)
            : "—";
        lines.push(`| ${fmtMs(s.startMs)} | ${fmtMs(s.endMs)} | ${s.text} | ${intensity} |`);
      }
    }
  }

  // —— v2：镜头级最终提示词清单（可直接投喂 AI 视频基模） ——
  const prompts = project.timelineClips.filter(
    (c) => (c as Record<string, unknown>).finalPrompt
  );
  if (prompts.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`## 🤖 镜头级最终提示词 (${prompts.length} 条 · 锚定组装产物)`);
    lines.push("");
    for (const clip of prompts) {
      const c = clip as Record<string, string>;
      lines.push(
        `**#${c.no} ${c.name}**（${c.shotSize ?? ""} · ${cameraLabel(c.cameraMovement ?? "")}）`
      );
      lines.push("```text");
      lines.push(c.finalPrompt);
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("*制作团队：剧集智能创编工坊 (DRAMA STUDIO) · AI 剧组流水线*");

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

// ============================================================
// v2 ·「AI 剧组流水线」领域模型
// 产品定位：不是视频生成器，而是一条 AI 剧组流水线——
// 制片 → 编剧 → 选角定妆 → 导演拆镜 → 场记锚定 → 后期成包，
// 让普通用户不慬运镜/景别/轴线，也能产出专业级制作包。
// ============================================================

/** 剧组角色（产品语言，贯穿流水线日志与前端进度面板）
 *  §7.13 v2.6：删除 color 字段——岗位色在 v2.5.1 已降级为“仅数据不渲染”，
 *  零消费点却持续诱导组件层误用（P0 白屏事故源头），干脆移除 */
export type CrewRoleKey =
  | "producer"
  | "screenwriter"
  | "casting"
  | "director"
  | "supervisor"
  | "post";

export const CREW_ROLES: Record<CrewRoleKey, { name: string; duty: string }> = {
  producer: {
    name: "制片主任",
    duty: "立项统筹 · 下发题材战术手册",
  },
  screenwriter: {
    name: "编剧",
    duty: "黄金 3 秒钩子 · 场次剧本",
  },
  casting: {
    name: "选角定妆",
    duty: "角色/场景/道具资产锁定",
  },
  director: {
    name: "导演",
    duty: "一场拆多镜 · 正反打节奏",
  },
  supervisor: {
    name: "场记",
    duty: "锚定组装 · 一致性校验",
  },
  post: {
    name: "后期",
    duty: "三轨落轨 · 情绪能量曲线",
  },
};

/** 流水线阶段定义（编排顺序即数组顺序，weight 用于进度加权） */
export interface RunStageDef {
  key: string;
  name: string;
  role: CrewRoleKey;
  weight: number;
}

export const RUN_STAGES: RunStageDef[] = [
  { key: "screenwriting", name: "剧本创作", role: "screenwriter", weight: 20 },
  { key: "casting", name: "选角定妆", role: "casting", weight: 15 },
  { key: "directing", name: "导演拆镜", role: "director", weight: 40 },
  { key: "anchoring", name: "锚定组装", role: "supervisor", weight: 10 },
  { key: "postproduction", name: "后期成包", role: "post", weight: 15 },
];

export type RunStatus = "running" | "succeeded" | "failed";
export type StageStatus = "pending" | "running" | "succeeded" | "failed";

export const RUN_STATUS: Record<
  RunStatus,
  { label: string; cls: string }
> = {
  running: {
    label: "拍摄中",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  },
  succeeded: {
    label: "已杀青",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  },
  failed: {
    label: "中断",
    cls: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  },
};

export interface RunStageInfo {
  key: string;
  name: string;
  role: CrewRoleKey;
  status: StageStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

/** 剧组日志条目（流水线的生产观测窗口） */
export interface RunLogEntry {
  at: string;
  role: CrewRoleKey;
  message: string;
}

export interface RunDTO {
  id: string;
  projectId: string;
  status: RunStatus;
  progress: number;
  stage: string;
  stages: RunStageInfo[];
  journal: RunLogEntry[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** —— 资产库 —— */
export type AssetKind = "character" | "scene" | "prop";

export const ASSET_KIND_META: Record<
  AssetKind,
  { label: string; icon: string; cls: string }
> = {
  character: {
    label: "角色",
    icon: "user",
    cls: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  },
  scene: {
    label: "场景",
    icon: "city",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  },
  prop: {
    label: "道具",
    icon: "gift",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
};

export interface VoiceProfile {
  voiceId: string;
  speed: number;
  style: string;
}

export interface AssetDTO {
  id: string;
  kind: AssetKind;
  name: string;
  lockedAppearance: string;
  visualAnchor: string;
  voiceProfile: VoiceProfile | null;
  portraitUrl: string | null;
  source: "crew" | "manual";
  /** 被多少个镜头引用（服务端聚合，用于解冻风险提示） */
  refCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 镜头 ↔ 资产引用（扁平列表，前端按 clipId 分组） */
export interface ShotRefDTO {
  id: string;
  clipId: string;
  assetId: string;
  kind: AssetKind;
  assetName: string;
  stateNote: string | null;
}

/** —— 渲染任务（外部生成通道） —— */
export type TaskKind = "portrait" | "video" | "voiceover";
export type TaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export const TASK_STATUS: Record<
  TaskStatus,
  { label: string; cls: string }
> = {
  queued: {
    label: "排队中",
    cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
  },
  running: {
    label: "生成中",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  },
  succeeded: {
    label: "已完成",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  },
  failed: {
    label: "失败",
    cls: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  },
  cancelled: {
    label: "已取消",
    cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-500",
  },
};

export const TASK_KIND_META: Record<
  TaskKind,
  { label: string; cls: string }
> = {
  portrait: { label: "定妆照", cls: "border-fuchsia-500/40 text-fuchsia-300" },
  video: { label: "镜头渲染", cls: "border-sky-500/40 text-sky-300" },
  voiceover: { label: "台词配音", cls: "border-teal-500/40 text-teal-300" },
};

export interface TaskDTO {
  id: string;
  projectId: string;
  kind: TaskKind;
  status: TaskStatus;
  payload: Record<string, unknown>;
  resultUrl: string | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** —— 轨道层 —— */
export type TrackKind = "subtitle" | "sfx" | "bgm" | "voiceover";

export const TRACK_KIND_META: Record<
  TrackKind,
  { label: string; cls: string }
> = {
  subtitle: {
    label: "字幕轨",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  sfx: {
    label: "音效轨",
    cls: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  },
  bgm: {
    label: "配乐轨",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  voiceover: {
    label: "配音轨",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  },
};

export interface TrackItemDTO {
  id: string;
  kind: TrackKind;
  clipId: string | null;
  startMs: number;
  endMs: number;
  text: string;
  style: Record<string, unknown> | null;
}

/** —— 情绪能量曲线 —— */
export interface EnergyCurvePoint {
  clipId: string;
  order: number;
  beatIndex: number;
  energy: number;
}

// ============================================================
// 工作台扩展模型（项目持久化 / 镜头轨管理）
// 状态枚举集中在此定义，新增状态只改这一处
// ============================================================

export const CLIP_STATUS = {
  pending: { label: "待生成", cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400" },
  generating: { label: "生成中", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  ready: { label: "已生成", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  failed: { label: "生成失败", cls: "border-rose-500/40 bg-rose-500/10 text-rose-400" },
} as const;

export type ClipStatus = keyof typeof CLIP_STATUS;

export const PROJECT_STATUS = {
  draft: "草稿",
  beatsReady: "分镜就绪",
  inProduction: "制作中",
  archived: "已归档",
} as const;

export type ProjectStatus = keyof typeof PROJECT_STATUS;

/** 镜头轨片段（客户端视图） */
export interface ClipData {
  id: string;
  beatIndex: number;
  order: number;
  name: string;
  subtitle: string;
  format: string;
  status: ClipStatus;
  mediaUrl: string | null;
  durationMs: number | null;
  /** —— 分镜拆解扩展（可空：手动创建的片段无拆解信息） —— */
  /** 景别：远景/全景/中景/近景/特写/大特写 */
  shotSize: string | null;
  /** 运镜（CAMERA_MOVEMENTS 键名） */
  cameraMovement: string | null;
  /** 画面内容（拆解出的镜头描述） */
  visualDesc: string | null;
  /** 计划时长（毫秒） */
  plannedMs: number | null;
  /** —— v2：锚定与节奏 —— */
  /** 组装管线产出的最终英文视频提示词 */
  finalPrompt: string | null;
  /** 锚点指纹（"manual" = 人工微调；null = 未组装） */
  promptVersion: string | null;
  /** 情绪能量 0~100 */
  energy: number | null;
  /** 建议音效标签 */
  sfxHint: string | null;
}

/** 分镜拆解产物：一场 → 多个镜头（v2 协议：能量 / 音效 / 资产引用） */
export interface ShotBreakdownItem {
  name: string;
  shotSize: ShotSize | string;
  cameraMovement: string;
  visualDesc: string;
  subtitle: string;
  plannedMs: number;
  energy: number;
  sfxHint: string;
  /** 英文动作提示词（锚定组装的动作段来源） */
  visualPrompt: string | null;
  /** 出场角色名（与资产座行对齐） */
  characters: string[];
  /** 场景名 */
  scene: string;
  /** 关键道具名 */
  props: string[];
}

/** 项目库列表项（摘要） */
export interface ProjectSummary {
  id: string;
  title: string;
  status: ProjectStatus;
  genreId: string;
  genreName: string;
  genreBadge: string;
  clipCount: number;
  beatCount: number;
  updatedAt: string;
  /** v2.3：剧集归属（可空 = 独立单集项目） */
  seriesId: string | null;
  seriesTitle: string | null;
  episodeNo: number | null;
}

/** —— 系列（v2.3 多剧集连载容器） —— */

export interface SeriesSummary {
  id: string;
  title: string;
  synopsis: string;
  genreName: string;
  episodeCount: number;
  updatedAt: string;
}

/** 系列详情内的单集摘要 */
export interface SeriesEpisodeSummary {
  id: string;
  episodeNo: number;
  title: string;
  status: ProjectStatus;
  clipCount: number;
  beatCount: number;
  /** 本集镜头计划总时长（毫秒，拆镜后汇总） */
  plannedMs: number;
  updatedAt: string;
}

export interface SeriesDetail {
  id: string;
  title: string;
  synopsis: string;
  genreId: string;
  genreName: string;
  genreBadge: string;
  hookTactic: string;
  musicMood: string;
  tonePrompt: string;
  episodes: SeriesEpisodeSummary[];
  createdAt: string;
  updatedAt: string;
}

/** 新建剧集请求体（题材与模型参数缺省时继承系列/上一集） */
export interface CreateEpisodePayload {
  title?: string;
  synopsis: string;
  /** 从上一集克隆资产库（含定妆图引用，跨集视觉一致） */
  cloneAssets?: boolean;
  genre?: CreateProjectDraftPayload["genre"];
  modelConfig?: ModelConfig;
}

/** 立项草稿请求体（「全组开机」第一步：先建项目，再启动流水线） */
export interface CreateProjectDraftPayload {
  title?: string;
  genre: {
    id: string;
    name: string;
    badge: string;
    hookTactic: string;
    musicMood: string;
    tonePrompt: string;
  };
  synopsis: string;
  modelConfig: ModelConfig;
}

/** 项目详情（项目 + 分镜 + 镜头轨 + v2 制作包全量） */
export interface ProjectDetail extends ProjectSummary {
  synopsis: string;
  aspectRatio: string;
  modelConfig: ModelConfig;
  genre: {
    id: string;
    name: string;
    badge: string;
    hookTactic: string;
    musicMood: string;
    tonePrompt: string;
  };
  storyBeats: StoryBeat[];
  timelineClips: ClipData[];
  createdAt: string;
  schemaVersion: string;
  /** —— v2 制作包 —— */
  assets: AssetDTO[];
  shotRefs: ShotRefDTO[];
  tracks: TrackItemDTO[];
  /** 锚点已过期（资产改动后需重组装）的镜头 id 列表 */
  anchorStaleClipIds: string[];
  /** 进行中/最近一次流水线运行 */
  activeRun: RunDTO | null;
  /** v2.4：成片合成产物地址（null = 尚未合成） */
  finalVideoUrl: string | null;
  /** v2.5 §7.11：转场策略（cut/fade/auto） */
  transitionMode: string;
  /** v2.5 §7.11：调色预设键（null = 跟随题材影调） */
  gradePreset: string | null;
}

/** 保存项目的请求体（genre 只要求持久化快照字段，与 zod 校验器对齐） */
export interface SaveProjectPayload {
  title?: string;
  genre: {
    id: string;
    name: string;
    badge: string;
    hookTactic: string;
    musicMood: string;
    tonePrompt: string;
  };
  synopsis: string;
  modelConfig: ModelConfig;
  storyBeats: StoryBeat[];
  status?: ProjectStatus;
}

/**
 * 将项目详情转换为与原版对齐的导出工程数据。
 * timelineClips 按 order 排序填入，含状态与成片地址（原版 schema 的前向兼容超集）。
 */
export function toExportData(detail: ProjectDetail): DramaProjectData {
  const clips = [...detail.timelineClips].sort((a, b) => a.order - b.order);
  return {
    project: {
      title: detail.title,
      version: detail.schemaVersion,
      exportedAt: new Date().toISOString(),
      genre: { ...detail.genre },
      aspectRatio: detail.aspectRatio,
      synopsis: detail.synopsis,
      modelConfig: detail.modelConfig,
    },
    storyBeats: detail.storyBeats,
    timelineClips: clips.map((c, i) => ({
      no: i + 1,
      name: c.name,
      beatRef: `场 ${String(c.beatIndex).padStart(2, "0")}`,
      subtitle: c.subtitle,
      format: c.format,
      status: CLIP_STATUS[c.status].label,
      mediaUrl: c.mediaUrl ?? "",
      ...(c.shotSize ? { shotSize: c.shotSize } : {}),
      ...(c.cameraMovement
        ? {
            cameraMovement: c.cameraMovement,
            cameraPrompt: CAMERA_MOVEMENTS[c.cameraMovement]?.prompt ?? "",
          }
        : {}),
      ...(c.visualDesc ? { visualDesc: c.visualDesc } : {}),
      ...(c.plannedMs != null ? { plannedMs: c.plannedMs } : {}),
      ...(c.finalPrompt ? { finalPrompt: c.finalPrompt } : {}),
      ...(c.energy != null ? { energy: c.energy } : {}),
      ...(c.sfxHint ? { sfxHint: c.sfxHint } : {}),
    })),
    statistics: {
      totalBeats: detail.storyBeats.length,
      totalClips: clips.length,
      hasSynthesizedOutput: clips.length > 0 && clips.every((c) => c.status === "ready"),
    },
    // —— v2 可选扩展段（旧消费者忽略未知字段即可） ——
    ...(detail.assets.length > 0
      ? {
          assets: detail.assets.map((a) => ({
            kind: a.kind,
            name: a.name,
            lockedAppearance: a.lockedAppearance,
            visualAnchor: a.visualAnchor,
            ...(a.portraitUrl ? { portraitUrl: a.portraitUrl } : {}),
            refCount: a.refCount,
          })),
        }
      : {}),
    ...(detail.tracks.length > 0
      ? {
          tracks: {
            subtitle: detail.tracks.filter((t) => t.kind === "subtitle"),
            sfx: detail.tracks.filter((t) => t.kind === "sfx"),
            bgm: detail.tracks.filter((t) => t.kind === "bgm"),
          },
        }
      : {}),
    ...(clips.some((c) => c.energy != null)
      ? {
          energyCurve: clips.map((c, i) => ({
            clipId: c.id,
            order: i,
            beatIndex: c.beatIndex,
            energy: c.energy ?? 50,
          })),
        }
      : {}),
  };
}
