# 剧集智能创编工坊 · v2 底层架构设计

> 版本：v2.0-draft1 ｜ 日期：2026-11-10 ｜ 状态：待实施
> 本文档是 v2 全部扩容的唯一设计依据。实施时新建代码必须与本文的模型、接口、目录、阶段划分一致；如需偏离，先改文档再改代码。

---

## 1. 背景与演进目标

### 1.1 为什么升级

v1.5 已跑通「题材 → 剧本三幕 → 一幕拆多镜头 → 镜头轨 → 导出」的单集创作闭环。但对齐微短剧工业生产的真实流程后，存在四个结构性缺口：

| 缺口 | 工业实况 | v1.5 现状 |
| --- | --- | --- |
| 颗粒度 | 每集 10~20 个分镜，1~3 秒/镜，正反打高频切换 | 三幕节拍 + 每幕 3~5 镜头（已部分解决） |
| 一致性 | 角色跨镜头不换脸、道具外观锁死，是最大返工源 | 无资产概念，每镜头提示词各写各的 |
| 生产组织 | 连载式多剧集生产、统一素材库跨集复用 | 单集孤岛，无剧集/系列层级 |
| 合成层 | 金句大字字幕、音效卡点、情绪配乐、能量曲线节奏管理 | 无轨道概念 |

### 1.2 对标来源（能力，而非实现）

v2 的功能清单来自对业界头部「创编一体」AI 视频创作平台的公开产品能力的归纳。我们**只借鉴其经过市场验证的工作流设计与领域划分**，作为中立的设计输入：

1. **剧本 → 分集 → 分镜的自动拆解链路**，且策划阶段与渲染阶段分离（对应我们：生成与渲染任务分离）；
2. **角色/场景/道具资产库**：资产一次定妆，跨镜头、跨剧集复用，由一致性机制防止「换脸穿帮」（对应我们：资产表 + 锚定提示词 + 参考图）；
3. **节点式画布工作流**：分镜通过引用关系连接资产，提示词自动组装（对应我们：引用建模 + 提示词组装管线）；
4. **多模型聚合调度**：文本/图像/视频能力按任务类型路由到不同模型（对应我们：Provider 抽象 + 工厂路由）；
5. **异步任务与无人值守批量**：提交 → 排队 → 轮询 → 回写，支持高并发（对应我们：RenderTask + 调度器 + 轮询 API）；
6. **时间线 + 故事板双视图**：时间轴看节奏，故事板看画面（对应我们：前端双视图）；
7. **配音与轨道合成**：台词驱动配音、多人对话音轨对齐、字幕/音效/BGM 一体化输出（对应我们：AudioProvider + 三轨数据结构）。

### 1.3 v2 不做什么（边界）

- 不做真人视频级成片合成器（FFmpeg 拼接属 v3）；
- 不做多人协作与权限体系（单机单用户，表结构预留）；
- 不做用户账户与计费（预留用量计数字段）;
- 不逆向任何第三方平台的私有接口；外部能力一律走本平台内置通道或未来以合规方式接入的公开模型服务。

---

## 2. 现状基线（v1.5 已落地，v2 必须保留并复用）

| 模块 | 位置 | 状态 | v2 处置 |
| --- | --- | --- | --- |
| Prisma + SQLite | `prisma/schema.prisma`、`db/custom.db` | Project / StoryBeat / TimelineClip 三表 | 保留，增量迁移 |
| 服务层 | `src/server/services/*.ts` | project-service（CRUD/镜头轨事务重排）、breakdown-service（拆镜） | 保留为领域服务核心，继续在此演进 |
| 校验层 | `src/server/validators.ts` | zod 全量入参校验 | 保留，随新契约扩充 |
| API 封套 | `src/lib/api-utils.ts` | ok/fail/RouteError 统一响应 | 保留 |
| 导出对齐 | `src/lib/drama.ts` | 与原版 v1.2.0 导出 schema 对齐 + 12 种运镜库 + 幕级运镜池 | 保留，导出结构向后兼容扩展 |
| 适配器雏形 | `src/lib/adapters/video-generation.ts` | VideoGenerationAdapter 接口 + noop 实现 | **升级为 Provider 体系**（见 §7.4） |
| 前端状态 | `src/store/workbench.ts` | Zustand 工作台 store + api() 封装 | 保留，按工作台分区扩展 |
| 主界面 | `src/app/page.tsx` | 暗黑影棚风单页工作台 | 保留，v2 增加路由级视图 |

---

## 3. 设计原则（六条）

1. **数据与执行分离**：项目/资产/镜头/任务都是数据；生成、渲染、配音都是执行。执行永远由任务系统驱动，写入数据由服务层完成，二者不互相穿透。
2. **一切耗时皆任务**：凡是超过 2 秒的模型调用（拆镜、定妆图、视频、配音）一律提交为 `RenderTask`，走「排队 → 执行 → 轮询 → 回写」状态机，前端永不直接等待模型。
3. **存储与模型可插拔**：持久化经由 Prisma（SQLite 起步，连接串可换 Postgres）；生成能力经由 Provider 接口。任何一层替换实现，不改动相邻层。
4. **一致性靠锚定，不靠运气**：每个镜头的画面提示词由「资产锁定段 + 场景段 + 动作段 + 运镜段 + 影调段」确定性组装，禁止自由拼接。
5. **向后兼容导出**：导出 JSON 必须保持与既有工作流（v1.2.0 schema）字段兼容，新增字段一律以可选字段追加，旧消费者不受影响。
6. **增量演进**：不推翻 v1.5 任何已验证模块；新表新增、旧表加列可空，迁移必须可在本地一键执行。

---

## 4. v2 目标能力与优先级

| 编号 | 能力 | 说明 | 优先级 | 阶段 |
| --- | --- | --- | --- | --- |
| C1 | 资产库 | 角色/场景/道具三类资产，含定妆图、锁定外观描述、音色档案 | P0 | v2.0 |
| C2 | 一致性锚定 | 镜头提示词确定性组装 + 资产引用校验 | P0 | v2.0 |
| C3 | 镜头级视觉提示词 | 每镜头最终英文 video prompt 由组装管线产出 | P0 | v2.0 |
| C4 | 异步任务管线 | RenderTask 状态机 + 调度器 + 轮询 API | P0 | v2.1 |
| C5 | 视频渲染接入 | 平台内置视频生成通道接入 Provider，产物回写镜头轨 | P0 | v2.1 |
| C6 | 角色定妆图 | 图像通道生成角色主图/三视图，存资产库 | P1 | v2.1 |
| C7 | 台词配音 | TTS 通道按角色音色档案生成台词音频 | P1 | v2.2 |
| C8 | 轨道层 | 字幕轨（金句大字/关键词变色）、音效轨（卡点）、BGM 轨 | P1 | v2.2 |
| C9 | 情绪能量曲线 | 每镜头 0~100 能量值 + 全集曲线数据 | P1 | v2.2 |
| C10 | 多剧集结构 | 系列 → 剧集层级，资产跨剧集复用 | P1 | v2.3 |
| C11 | 批量生产 | 系列级一键批量提交渲染任务 | P2 | v2.3 |
| C12 | 双视图前端 | 故事板视图 + 时间线视图 + 资产库面板 + 任务中心 | P0 | 随各阶段 |

---

## 5. 领域模型演进

### 5.1 v2.0 新增表

```prisma
// ============ 资产库（一致性锚定的数据基础） ============

/// 资产类型：character 角色 | scene 场景 | prop 道具
enum AssetKind {
  character
  scene
  prop
}

model Asset {
  id        String    @id @default(cuid())
  projectId String
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  kind      AssetKind
  name      String                  // 如「林昭」「清河村寨」「老怀表」
  /// 锁定外观描述（中文，定稿后不再改动）—— 一致性锚定的语义核心
  /// 例：「35岁男性特战队长，寸头，左眉骨有疤，黑色战术背心…」
  lockedAppearance String
  /// 英文视觉锚点串，组装进每个镜头提示词的资产段
  /// 例："35-year-old Chinese male special forces captain, buzz cut, scar on left brow, black tactical vest"
  visualAnchor     String
  /// 音色档案（仅 character）：voiceId / 语速 / 风格标签，TTS 通道使用
  voiceProfile     Json?    // { "voiceId": "...", "speed": 1.0, "style": "calm" }

  /// 定妆图：主图与三视图的产物地址（图像通道生成后回写）
  portraitUrl   String?
  turnaroundUrl String?   // 三视图拼图（可选）

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  shots     ShotRef[]               // 反向：哪些镜头引用了本资产

  @@unique([projectId, kind, name])
  @@index([projectId, kind])
  @@map("assets")
}

// ============ 镜头 ↔ 资产 引用关系 ============

model ShotRef {
  id       String @id @default(cuid())
  shotId   String
  shot     TimelineClip @relation(fields: [shotId], references: [id], onDelete: Cascade)
  assetId  String
  asset    Asset        @relation(fields: [assetId], references: [id], onDelete: Cascade)
  /// 引用资产在本镜头中的状态补充（可空）：如「负伤」「换官服」
  stateNote String?

  @@unique([shotId, assetId])
  @@map("shot_refs")
}
```

### 5.2 既有表加列（可空，向后兼容）

```prisma
model TimelineClip {
  // …（v1.5 全部字段保留）…

  // —— v2.0：提示词与锚定 ——
  finalPrompt   String?   // 组装管线产出的最终英文视频提示词（定稿后随镜头冻结）
  promptVersion String?   // 组装时各资产锚点的指纹（见 §7.1 校验）

  // —— v2.2：轨道与能量 ——
  energy      Int?        // 情绪能量值 0~100（拆镜时由 LLM 产出或人工标定）
  sfxHint     String?     // 建议音效标签，如 "sword_clash" "heartbeat"

  // —— v2.3：剧集归属（可空 = 仍为独立单集项目） ——
  episodeId   String?
}

model StoryBeat {
  // …（v1.5 全部字段保留）…
  energyStart Int?   // 幕首能量
  energyEnd   Int?   // 幕尾能量（拆镜时同时产出）
}

model Project {
  // …（v1.5 全部字段保留）…
  seriesId  String?           // v2.3：归属系列
  episodeNo Int?              // v2.3：剧集序号（1 起始）
}
```

### 5.3 v2.1 / v2.2 新增表

```prisma
// ============ 渲染任务（一切耗时操作的统一载体） ============

enum TaskKind {
  breakdown    // 一幕拆镜头（LLM）
  portrait     // 资产定妆图（图像通道）
  video        // 镜头视频渲染（视频通道）
  voiceover    // 台词配音（TTS 通道）
}

enum TaskStatus {
  queued      // 已入队
  running     // 执行中（含等待外部异步结果）
  succeeded
  failed
  cancelled
}

model RenderTask {
  id        String     @id @default(cuid())
  projectId String
  project   Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)

  kind      TaskKind
  status    TaskStatus @default(queued)
  /// 业务负载：记录任务操作的目标与入参（JSON），如
  /// video:     { clipId, attempt, finalPrompt, resolution, aspectRatio, videoModel }
  /// portrait:  { assetId, prompt, kind: "portrait" | "turnaround" }
  /// voiceover: { clipId, assetId, text, voiceProfile }
  payload   Json
  /// 外部异步任务的句柄（平台通道返回的 taskId，轮询用）
  remoteTaskId String?
  /// 产物地址（渲染产物 / 音频文件 / 图片地址）
  resultUrl String?
  attempts  Int        @default(0)
  maxAttempts Int      @default(2)
  error     String?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@index([projectId, status])
  @@index([status, createdAt])
  @@map("render_tasks")
}

// ============ 轨道层（v2.2：字幕 / 音效 / 配乐） ============

enum TrackKind {
  subtitle   // 金句大字字幕
  sfx        // 音效卡点
  bgm        // 情绪配乐段
}

model TrackItem {
  id        String    @id @default(cuid())
  projectId String
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  kind      TrackKind
  clipId    String?   // 关联镜头（可空 = 全集级，如 BGM 段）
  /// 起止时间（毫秒，相对本集时间线 0 点）
  startMs   Int
  endMs     Int
  /// 文本内容：subtitle = 字幕文本；sfx = 音效标签；bgm = 情绪标签
  text      String
  /// 样式负载（JSON，可空）：
  /// subtitle: { "highlightWords": ["雷", "怒"], "scale": "xl", "position": "center" }
  /// bgm:      { "intensity": 0.8, "mood": "epic" }
  style     Json?

  @@index([projectId, kind, startMs])
  @@map("track_items")
}
```

### 5.4 领域关系总览

```
Series (v2.3)
  └── Project（= 剧集，v2.3 加 seriesId/episodeNo）
        ├── Asset（角色/场景/道具 × N，含 lockedAppearance + visualAnchor + 定妆图）
        ├── StoryBeat × 3（幕节拍，含 energyStart/energyEnd）
        ├── TimelineClip × N（镜头，含 finalPrompt / energy / sfxHint）
        │     └── ShotRef × N ──→ Asset（引用 + 镜内状态注记）
        ├── RenderTask × N（breakdown / portrait / video / voiceover）
        └── TrackItem × N（subtitle / sfx / bgm）
```

### 5.5 TypeScript DTO 增量（`src/lib/drama.ts` 扩展）

```ts
// —— 资产 ——
export interface AssetDTO {
  id: string;
  kind: "character" | "scene" | "prop";
  name: string;
  lockedAppearance: string;
  visualAnchor: string;
  voiceProfile: VoiceProfile | null;
  portraitUrl: string | null;
  turnaroundUrl: string | null;
}
export interface VoiceProfile { voiceId: string; speed: number; style: string }

// —— 任务 ——
export interface TaskDTO {
  id: string;
  kind: "breakdown" | "portrait" | "video" | "voiceover";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  payload: Record<string, unknown>;
  resultUrl: string | null;
  attempts: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

// —— 轨道 ——
export interface TrackItemDTO {
  id: string;
  kind: "subtitle" | "sfx" | "bgm";
  clipId: string | null;
  startMs: number;
  endMs: number;
  text: string;
  style: Record<string, unknown> | null;
}

// —— 能量曲线（导出与前端绘图共用） ——
export interface EnergyCurvePoint { clipId: string; order: number; energy: number }
```

---

## 6. 分层架构

```
┌──────────────────── UI 层（src/app + src/components + src/store） ────────────────────┐
│  /              工作台首页（题材 → 梗概 → 生成三幕 → 拆镜 → 镜头轨）                    │
│  /project/[id]  剧集工作区：故事板视图 / 时间线视图 / 资产库面板 / 任务中心            │
│  /library       项目库（系列分组、状态筛选）                                          │
│  store: workbench（会话） + project-store（数据缓存与乐观更新）                       │
├──────────────────── API 层（src/app/api/**，仅校验 + 委派 + 封套） ───────────────────┤
│  projects CRUD │ assets CRUD │ shots 引用管理 │ tasks 提交与轮询 │ tracks CRUD │ export │
├──────────────────── 领域服务层（src/server/services + engines + tasks） ──────────────┤
│  project-service   项目/镜头轨业务（已有，扩展资产引用联动）                          │
│  asset-service     资产 CRUD + 锚点指纹校验                                          │
│  breakdown-service 一幕拆镜（已有，升级输出 energy/sfx/资产引用）                     │
│  prompt-engine     提示词组装管线（纯函数，见 §7.2）                                  │
│  task-dispatcher   任务调度器（见 §7.3）                                              │
│  track-service     轨道 CRUD + 能量曲线聚合                                          │
├──────────────────── Provider 抽象层（src/server/providers/） ─────────────────────────┤
│  TextProvider    → ZaiTextProvider     （chat.completions）                          │
│  ImageProvider   → ZaiImageProvider    （images.generations / edit）                 │
│  VideoProvider   → ZaiVideoProvider    （video.generations + async 轮询）            │
│  AudioProvider   → ZaiAudioProvider    （audio.tts）                                 │
│  工厂：createProvider(kind, options) — 唯一出口，禁止业务层直连 SDK                  │
├──────────────────── 持久层（Prisma + SQLite，连接串可换） ────────────────────────────┤
│  Project / StoryBeat / TimelineClip / Asset / ShotRef / RenderTask / TrackItem / (Series) │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**层间铁律**：
- UI 只调 API，不 import Prisma / SDK；
- API 路由只做「zod 校验 → 服务层调用 → ok/fail」，不含业务逻辑；
- 服务层是唯一业务入口；跨表操作必须在服务层事务内完成；
- 只有 Provider 层允许 `import ZAI`，且只在服务端调用。

---

## 7. 关键机制设计

### 7.1 一致性锚定（C1/C2）

**核心思想**：角色「不换脸」不依赖模型记忆，而是让每个镜头的提示词携带同一份不可变语义锚点 + 同一张参考图。

1. **锁定外观（lockedAppearance）**：资产定稿后其外观描述冻结。服务层对定稿资产加防改检查——若镜头已引用且已产出 finalPrompt，改锚点需先「解冻确认」（前端二次确认后置 `promptVersion=null` 并将关联镜头回置 pending）。
2. **视觉锚点（visualAnchor）**：英文视觉描述串，是组装管线资产段的唯一来源。派生自 lockedAppearance，由 LLM 翻译定稿，人工可改。
3. **锚点指纹（promptVersion）**：`sha256(所有引用资产的 visualAnchor + tonePrompt).slice(0,12)`。镜头完成渲染后记录指纹；资产锚点变动 → 指纹失配 → 该镜头在故事板上标「锚点过期」，提示重渲。这让「改了角色长相 → 哪些镜头受影响」变成可计算的。
4. **参考图注入**：资产定妆图（portraitUrl）作为图生视频的参考输入（平台视频通道支持参考图时传入；不支持时锚点串兜底）。数据结构已预留，不阻塞文本锚点先行。

### 7.2 提示词组装管线（C3）

`src/server/engines/prompt-engine.ts`，**纯函数、可单测、禁止 IO**：

```ts
export interface PromptInput {
  shot: { visualDesc: string; cameraMovement: string; shotSize: string; subtitle: string };
  characters: Array<{ visualAnchor: string; stateNote?: string }>;
  scene: { visualAnchor: string } | null;
  props: Array<{ visualAnchor: string; stateNote?: string }>;
  tonePrompt: string;           // 题材影调锚点
  aspectRatio: string;
}
export interface PromptOutput {
  finalPrompt: string;          // 组装结果（英文）
  fingerprint: string;          // 锚点指纹
  segments: {                   // 分段透出（前端可查看/微调各段）
    characters: string; scene: string; props: string;
    action: string; camera: string; tone: string; technical: string;
  };
}
export function composeVideoPrompt(input: PromptInput): PromptOutput;
```

组装顺序固定：`角色段 → 场景段 → 道具段 → 动作段 → 运镜段（CAMERA_MOVEMENTS.prompt）→ 影调段 → 技术段（比例/时长/画质）`。
分段结构的意义：前端「提示词微调」只允许改段内容重新组装，不允许绕过管线手写全文——保证锚定不被破坏。

### 7.3 异步任务管线（C4/C5）

**状态机**：

```
queued ──dispatch──▶ running ──▶ succeeded（resultUrl 回写 + 业务回写）
   │                   │
   └──cancel──▶ cancelled      └─attempts<max─▶ 重试（队列尾部）
                               └─attempts=max─▶ failed（error 落库）
```

**调度器**（`src/server/tasks/dispatcher.ts`，进程内单例）：

- `enqueue(task)`：事务内建 RenderTask 记录并推入内存队列；
- 并发上限：视频通道并发 2、图像 4、LLM 4、TTS 8（可配置，防打爆通道）；
- 轮询句柄：视频通道为异步任务（返回 remoteTaskId），dispatcher 持有 `async.result.query` 轮询（间隔 3s，超时 5min）；
- 业务回写：任务成功后由 dispatcher 回调各 kind 的 handler——
  - `video` → `updateClip(clipId, { status: "ready", mediaUrl, durationMs })`
  - `portrait` → `asset.portraitUrl / turnaroundUrl`
  - `voiceover` → TrackItem（audio 段）落库
  - `breakdown` → `replaceActClips(...)`（已有）
- 失败语义：失败只落库不抛 UI 异常，前端任务中心显示原因与「重试」按钮；
- 进程重启恢复：启动时把所有 `running` 任务置回 `queued` 重新调度（幂等：video handler 先查 remoteTaskId 是否仍在执行）。

**轮询 API**：前端不连队列，只轮询 REST：

```
GET /api/tasks?projectId=…&status=…     → TaskDTO[]（列表 + 汇总徽标）
GET /api/tasks/[id]                     → TaskDTO（单任务详情）
POST /api/tasks/[id]/retry              → 重派
POST /api/tasks/[id]/cancel             → 取消（queued 状态才可取消）
```

### 7.4 Provider 体系（升级现有 adapters）

将 `src/lib/adapters/video-generation.ts` 的思路泛化为四类通道，位置迁移至 `src/server/providers/`：

```ts
export interface Provider<TIn, TOut> {
  readonly name: string;
  readonly kind: "text" | "image" | "video" | "audio";
  generate(input: TIn): Promise<TOut>;
}
// VideoProvider 的 TOut 支持两种形态：
// { mode: "sync",  result } | { mode: "async", remoteTaskId }
```

- `createProvider(kind, options)` 工厂是唯一出口；`noop` 实现保留（视频通道不可用时降级为 noop，镜头允许手动粘贴外部成片地址——现有能力不回退）；
- 业务层（服务层）永远面向 `Provider` 接口编程，替换底层模型不改业务代码；
- 现有 `noopAdapter` 语义并入 `ZaiVideoProvider` 不可用分支，避免双轨。

### 7.5 多剧集结构（C10，v2.3）

低侵入演进：新增 `Series` 表（id/title/synopsis/genreId 快照/封面），`Project` 加可空 `seriesId + episodeNo`：

- 不填 → 现有独立单集项目（v1.5 数据零迁移）；
- 填 → 归入系列，成为第 N 集；
- 资产默认归属剧集（Project）；**系列级资产复用**通过「资产克隆」实现——创建第 N+1 集时，提供「从上一集复制资产库」操作（深拷贝 Asset 行到新剧集），规避跨剧集引用的一致性复杂度；v3 再评估共享引用；
- 项目库列表按系列分组展示，支持系列级「批量提交渲染」（C11：遍历系列下全部 pending 镜头逐个 enqueue）。

### 7.6 轨道与情绪能量曲线（C8/C9）

- **能量值来源**：拆镜 LLM 输出协议扩展——每个镜头增加 `energy`（0~100）与 `sfxHint` 字段，幕级增加 `energyStart/energyEnd`；拆镜提示词已要求「情绪递进」，能量值是它的量化载体。人工可在镜头卡片上拖拽修正。
- **曲线聚合**：`track-service.getEnergyCurve(projectId)` 按 order 输出 `EnergyCurvePoint[]`，前端绘制折线 + 幕分界线；低于阈值（如 40）的连续镜头在故事板上标「节奏塌陷」预警。
- **字幕轨**：拆镜产物中金句镜头自动生成 subtitle TrackItem（`style.highlightWords` 支持关键词变色）；**音效轨**：`sfxHint` + 镜头起止时间自动生成 sfx 卡点项；**BGM 轨**：按幕 energyStart/energyEnd 生成情绪段。三轨均可手工增删改。
- **导出**：TrackItem 以可选数组 `tracks: { subtitle: [...], sfx: [...], bgm: [...] }` 附加进导出 JSON，旧消费者忽略未知字段不受影响。

### 7.7 配音链路（C7）

角色资产的 `voiceProfile` 为 TTS 入参；`voiceover` 任务按镜头逐句生成音频，落为 TrackItem（`startMs/endMs` 依据镜头时长与文本长度估算）。多角色同镜对话按角色拆多条音频、时间轴错位排布（对口型的画面级实现依赖视频通道能力，v2 仅做音轨对齐，画面口型留 v3）。

---

## 8. API 契约清单

统一封套 `{ ok: true, data } / { ok: false, error, detail? }`（已有）。

| 方法与路径 | 说明 | 状态 |
| --- | --- | --- |
| GET/POST `/api/projects` | 项目列表 / 创建（已上线） | 保留 |
| GET/PATCH/DELETE `/api/projects/[id]` | 项目详情 / 更新 / 删除（已上线） | 保留 |
| POST `/api/projects/[id]/beats/[beatIndex]/breakdown` | 一幕拆镜头（已上线，扩展输出 energy/sfxHint/资产引用） | 扩展 |
| GET/POST `/api/projects/[id]/clips` | 镜头轨列表 / 手动加镜头（已上线） | 保留 |
| PATCH/DELETE `/api/clips/[id]` | 镜头更新（含 finalPrompt 微调）/ 删除（已上线） | 扩展 |
| POST `/api/projects/[id]/clips/reorder` | 镜头轨重排（已上线） | 保留 |
| GET/POST `/api/projects/[id]/assets` | 资产列表 / 新建资产 | **新增 v2.0** |
| PATCH/DELETE `/api/assets/[id]` | 资产更新（定稿锚点需解冻确认）/ 删除 | **新增 v2.0** |
| POST `/api/projects/[id]/shots/[clipId]/refs` | 镜头绑定资产（kind+assetId+stateNote） | **新增 v2.0** |
| DELETE `/api/shots/[clipId]/refs/[refId]` | 解绑资产 | **新增 v2.0** |
| POST `/api/projects/[id]/tasks` | 提交任务 `{ kind, target }`（breakdown/portrait/video/voiceover） | **新增 v2.1** |
| GET `/api/tasks?projectId=&status=` | 任务列表（轮询，`Cache-Control: no-store`） | **新增 v2.1** |
| GET/POST `/api/tasks/[id]` `/retry` `/cancel` | 任务详情 / 重试 / 取消 | **新增 v2.1** |
| GET `/api/projects/[id]/energy-curve` | 能量曲线点集 | **新增 v2.2** |
| GET/POST/PATCH/DELETE `/api/projects/[id]/tracks` | 轨道项 CRUD（按 kind 过滤） | **新增 v2.2** |
| GET `/api/projects/[id]/export` | 导出 JSON（tracks 可选段追加） | 扩展 |
| POST `/api/series` + GET `/api/series/[id]` | 系列创建 / 详情（含剧集列表） | **新增 v2.3** |

---

## 9. 目录结构规划（v2 全景）

```
src/
├── app/
│   ├── page.tsx                    # 工作台首页（保留）
│   ├── project/[id]/page.tsx       # 剧集工作区（故事板/时间线/资产/任务）
│   ├── library/page.tsx            # 项目库（v2.3 支持系列分组）
│   └── api/…                       # §8 全部路由
├── components/
│   ├── workbench/…                 # 现有工作台组件
│   ├── storyboard/…                # 故事板视图、镜头卡、锚点过期徽标
│   ├── timeline/…                  # 时间线视图、能量曲线、轨道条
│   ├── assets/…                    # 资产库面板（角色/场景/道具三页签）
│   └── tasks/…                     # 任务中心（徽标、重试、原因）
├── store/
│   ├── workbench.ts                # 会话（保留）
│   └── project-store.ts            # 剧集数据缓存 + 乐观更新 + 任务轮询
├── lib/
│   ├── drama.ts                    # DTO + 运镜库 + 导出（保留，增量扩展）
│   ├── genres.ts                   # 题材库（保留）
│   ├── api-utils.ts                # 封套（保留）
│   └── fingerprint.ts              # sha256 锚点指纹
├── server/
│   ├── validators.ts               # zod（保留，扩充资产/任务/轨道契约）
│   ├── services/
│   │   ├── project-service.ts      # 保留（扩展资产引用联动）
│   │   ├── asset-service.ts        # 新增
│   │   ├── breakdown-service.ts    # 保留（升级输出协议）
│   │   ├── track-service.ts        # 新增
│   │   └── task-service.ts         # 新增（任务 CRUD 代理）
│   ├── engines/
│   │   └── prompt-engine.ts        # 提示词组装（纯函数）
│   ├── tasks/
│   │   ├── dispatcher.ts           # 调度器（队列/并发/重试/恢复）
│   │   └── handlers/               # video / portrait / voiceover / breakdown 回写
│   └── providers/
│       ├── types.ts                # Provider 接口
│       ├── factory.ts              # createProvider
│       └── zai/                    # text / image / video / audio 实现
└── prisma/schema.prisma            # §5 全部模型
```

---

## 10. 实施路线图

每阶段独立可验收、可发版；阶段内任务顺序即依赖顺序。

### v2.0 —— 资产库与锚定地基（纯数据 + 组装，无外部通道）
1. Prisma 迁移：Asset / ShotRef + TimelineClip/StoryBeat 加列；
2. `asset-service` + 资产 API + 解冻保护；
3. `prompt-engine`（纯函数 + 单测：组装顺序、指纹、分段）；
4. breakdown-service 输出协议升级：每镜头输出引用资产名/energy/sfxHint（LLM 提示词同步升级）；
5. 工作区页面骨架 `/project/[id]`：故事板视图 + 资产面板（建/绑/改/删）+ 镜头卡显示 finalPrompt 分段。
**验收**：建角色 → 绑定到镜头 → 组装出带锚点的 finalPrompt；改角色锚点 → 镜头标「锚点过期」。

### v2.1 —— 任务管线与视频接入
1. RenderTask 迁移 + `task-service` + 任务 API；
2. `dispatcher`（内存队列 + 并发 + 重试 + 重启恢复）+ 四类 handler；
3. `ZaiVideoProvider`（video.generations + async.result.query 轮询）+ `ZaiImageProvider`（定妆图）；
4. 前端任务中心：提交/轮询/重试/取消，镜头状态与任务状态联动。
**验收**：镜头一键渲染 → 任务流转 → mediaUrl 回写故事板；断网/超时 → failed + 可重试；进程重启 → running 任务自动恢复。

### v2.2 —— 轨道、能量曲线与配音
1. TrackItem 迁移 + track-service + 轨道 API；
2. 拆镜产物自动落三轨；能量曲线 API + 前端曲线图 + 节奏预警；
3. `ZaiAudioProvider`（TTS）+ voiceProfile 编辑 UI + 配音任务接入。
**验收**：全集能量曲线可见且与幕结构吻合；金句字幕带变色关键词；台词音频落轨。

### v2.3 —— 多剧集与批量生产
1. Series 表 + Project 挂 seriesId/episodeNo + 资产克隆；
2. 项目库系列分组视图；
3. 系列级批量提交（遍历 enqueue，按并发上限排队）。
**验收**：一个系列 3 集、共享视觉基调，资产一键继承，批量提交后任务中心统一观测。

---

## 11. 风险与边界

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 视频通道配额/速率限制 | 任务积压 | 并发上限可配；失败重试退避；noop 降级允许手动贴片不阻塞创作 |
| LLM 拆镜输出不稳定 | 镜头数据非法 | 沿用现有「围栏剥离 + 截取 JSON」解析；zod 校验失败自动重试 1 次；人工编辑兜底 |
| 锚点漂移（改资产引发连锁重渲） | 成本失控 | 锚点指纹只标记不自动重渲；重渲由用户显式触发 |
| SQLite 单写并发 | 任务高频回写冲突 | 调度器写操作串行化（单 worker 回写队列）；数据量增长后换 Postgres 仅改连接串 |
| 内存队列进程重启丢任务 | 任务卡 running | 启动恢复逻辑强制回置 queued（§7.3）；v3 若多实例部署再引入持久化队列 |
| 导出兼容 | 旧消费者解析失败 | 新字段全部可选、顶层结构不变；导出前跑 schema 兼容断言 |
| 内容合规 | 平台风控驳回 | 生成前沿用题材库正向约束；对外部模型接入保持「合规渠道优先」原则 |

---

## 附录 A · 术语表

- **节拍（Beat）**：幕级叙事单元（hook/climax/cliffhanger），v1.5 已有；
- **镜头（Shot/Clip）**：最小可渲染单元，1~3 秒，v1.5 已有；
- **资产（Asset）**：角色/场景/道具的视觉定义，一致性锚定的载体，v2.0 新增；
- **锚点（Anchor）**：资产的冻结外观语义（中文 lockedAppearance + 英文 visualAnchor）；
- **指纹（Fingerprint）**：锚点内容的哈希，用于计算镜头提示词是否过期；
- **任务（RenderTask）**：一切耗时模型操作的统一载体与观测入口；
- **轨道（Track）**：字幕/音效/配乐的时间轴数据层。

## 附录 B · 与 v1.5 导出格式的兼容承诺

导出 JSON 顶层结构不变（`project / storyBeats / timelineClips / statistics`）；v2 新增信息以可选字段进入：
- `timelineClips[*].finalPrompt / energy / sfxHint`（逐镜头）；
- 顶层新增可选 `assets / tracks / energyCurve` 数组；
- 旧版导入器忽略未知字段即可无损消费。
