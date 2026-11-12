# 剧集智能创编工坊 · v2 底层架构设计

> 版本：v2.5.2 ｜ 日期：2026-11-12 ｜ 状态：**v2.0～v2.5 已实施（一键成片链路 + 成片视听专业化 + 工作台可读性专项）**
> 本文档是 v2 全部扩容的唯一设计依据。实施时新建代码必须与本文的模型、接口、目录、阶段划分一致；如需偏离，先改文档再改代码。
>
> **变更记录**
> - v2.5.2：会话工作台可读性专项（基于种子演示数据的五页签 VLM 四轮走查 6.0→7.0）：参数格两行栅格 + 状态徽标化 + 成片产出上提标题行、状态单一真相源（finalVideoUrl）、危险操作三件套（红描边+警示图标+AlertDialog 二次确认，§7.13 补则）、fuchsia/violet 残留清剿 5 处、镜头级节奏带（宽=时长/高=能量）、任务行时间戳、日志时间戳定宽成列、资产网格三列 + 徽标降噪、工作区全高底板、页签激活指示条、视频预览 ring 边界；新增 VLM 审计工具 `scripts/vlm-audit-workbench.mjs`（createVision 图片理解，零生成配额）。
> - v2.5.1：工作台视觉纪律（§7.13）：色彩收敛（唯一品牌渐变 + amber 单强调 + 题材身份色仅限选中态）、编号语言统一（01/02/03 mono）、CTA 层级修正（一键成片 accent 卡）、手机预览 REC 语境化、顶栏降噪；P0 阻断修复——剧组日志脏数据防御式降级（实拍白屏 `crew-pipeline-panel` journal 裸取 role.color）；新增零配额演示项目种子脚本（`scripts/seed-demo-project.mjs`，复用既有资产文件直插 DB，用于 UI 视觉回归审计）。
> - v2.4.4：成片音频专业化（P1）：合成链末级新增 EBU R128 响度归一（loudnorm **两遍法：第一遍仅音频测量，第二遍按实测值线性归一**，精准命中 -16 LUFS / TP -1.5dB / LRA 11，L2 可配；工程保障：第二遍 TP 参数按增益预估抬高防内部回撤、目标 LRA 取 max(配置，实测) 保线性、后置 alimiter 强制真峰值——实测单遍 -17.6 / 直接两遍 -18.8 → 修正后命中 ±0.5LU）；补齐三轨合成的 BGM 轨——用户上传 `POST/GET/DELETE /api/projects/[id]/bgm`（大小/MIME 校验，落 `public/assets/bgm_{projectId}.*`），合成时循环铺满全片 + 对白侧链自动闪避（sidechaincompress），BGM 基础增益与闪避强度 L2 可配；成片面板新增 BGM 管理行。全部纯 ffmpeg 本地处理，零外部通道/零配额消耗。
> - v2.4.2：参考图注入接线（§7.1.4 升级为已实施）：视频通道提交时自动携带镜头主要角色的定妆图作为首帧参考（image_url），新增 L2 运行参数 `PUBLIC_ASSETS_BASE_URL`（公网回源基址，默认空 = 不注入，文本锚点兜底）；通道对 image_url 不接受时 provider 自动去参重提一次（优雅降级，任务不失败，降级事实进服务端日志）。设计原则：**一致性优先靠参考图、锚点串兜底；能力协商在通道层自动完成，不依赖人工开关**。
> - v2.4：一键成片链路（渲染全片 render-all + 成片合成 compose，ffmpeg 片头卡/字幕烧录/配音混音，产物回写 Project.finalVideoUrl）；拆镜精简档位（每幕 3~4 镜 × 4~5s，整集约 40~60 秒，标准档保留可配）；选角面孔统一规则（CASTING_FACE_RULE，全部角色华人面孔，配置化）；前端工作台 Tab 化信息架构（成片/分镜剧本/资产定妆/节奏轨道/剧组进程，左列开机后自动折叠）。修复拆镜 plannedMs 钳制与档位不一致的问题。
> - v2.2：完成 v2.3 全部能力（Series 表/系列 API/资产克隆/批量提交/export 路由/tasks 列表路由）+ 3 集 60 秒系列 E2E 实测；拆镜档位 BREAKDOWN_SPEC 配置化（60 秒集档位）；文本通道 429 指数退避（20s/40s/80s，可环境变量覆盖）。
> - v2.1：新增 §1.4「产品定位：AI 剧组流水线」（产品叙事与术语映射）；§3 增补第 7 条「零硬编码」；新增 §7.8「配置中心」；§9 目录、§10 路线图同步（v2.2.5 配置化整改）。运行参数与模板文案收敛至 `src/config/`，业务代码禁止魔法数字与内嵌文案。
> - v2.0-draft1：初稿（领域模型 / 分层架构 / 任务管线 / API 契约 / 路线图）。

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

### 1.4 产品定位与叙事：AI 剧组流水线

**一句话定位**：我们交付的不是「视频生成器」，而是一条 **AI 剧组流水线**——把专业微短剧剧组的分工方式与生产纪律产品化。普通用户不懂运镜、景别、轴线，也能像导演一样下决策，拿到专业级的成片制作包。

**为什么是剧组隐喻（设计动机）**：

- 微短剧工业生产的门槛不在「生成一段视频」，而在剧组分工带来的**专业判断**：编剧的钩子设计、导演的镜语调度、场记的一致性盯守、后期的节奏卡点；
- 把这些专业判断沉淀为流水线阶段，用户只做「选择与验收」，专业动作由流水线代劳；
- 剧组角色即产品语言：前端进度面板、剧组日志、状态徽标全部使用剧组术语，用户零学习成本。

**流水线阶段（产品概念 ↔ 技术实现）**：

| # | 流水线阶段 | 剧组角色 | 用户做的事 | 技术实现 |
| --- | --- | --- | --- | --- |
| 0 | 制片立项 | 制片主任 | 选题材、给梗概、定参数 | 项目创建 + 题材预设库（配置数据） |
| 1 | 剧本创作 | 编剧 | 确认/改写三幕剧本 | TextProvider 三幕推演 |
| 2 | 选角定妆 | 选角定妆 | 过目定妆图、微调外观描述 | 资产提取 + ImageProvider 定妆 |
| 3 | 导演拆镜 | 导演 | 浏览分镜、拖拽修正 | 幕级拆镜（含能量值/音效标注） |
| 4 | 锚定组装 | 场记 | 无需参与（自动） | prompt-engine 确定性组装 + 锚点指纹 |
| 5 | 后期成包 | 后期 | 验收制作包（定妆图/字幕/音效/配乐/曲线） | 三轨落轨 + 能量曲线聚合 + 缺图资产自动提交定妆任务（幂等去重） |

**低门槛承诺（产品的验收标准）**：

1. 用户只需输入「题材 + 一句话梗概」，其余每一步都有默认专业动作兜底；
2. 每个阶段产物可视化、可回改：用户是导演（做决策），不是操作员（调参数）；
3. 全程透明：剧组日志（RunLogEntry）逐阶段记录「AI 在干什么、为什么这么干」。

**术语映射（技术语言 ↔ 产品语言，前端与文档一律使用右列）**：

| 技术概念 | 产品语言 |
| --- | --- |
| ProductionRun（多阶段编排） | 开机拍摄 |
| RenderTask（异步任务） | 拍摄任务 |
| Asset 定妆 / 锚点锁定 | 选角定妆 · 外观锁定 |
| prompt-engine 组装 | 场记盯守 · 一致性校验 |
| TrackItem 三轨 | 字幕 / 音效 / 配乐轨 |
| 能量曲线 | 节奏卡点表 |
| 任务成功 | 杀青 |

> 剧组角色与阶段权重为配置数据（`RUN_STAGES` / `CREW_ROLES`），新增阶段或调整文案不改业务代码。

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
7. **零硬编码**：题材策略、运镜库、提示词模板、流水线阶段、剧组角色、并发上限、轮询间隔、恢复窗口等一切可调参数与文案，一律为配置数据——预设库（`src/lib/`）或集中配置（`src/config/`）承载，支持环境变量覆盖；业务代码只消费配置，禁止散落魔法数字与内嵌文案（详见 §7.8）。

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

1. **锁定外观（lockedAppearance）**：资产定稿后其外观描述冻结。服务层对定稿资产加防改检查——若镜头已引用且已产出 finalPrompt，改锚点需先「解冻确认」（前端二次确认后，绑定镜头 `promptVersion` 置为 **"stale"** 标记并回置 pending；分镜表对 stale 镜头标「锚点过期」，资产库面板出现「重新锚定过期镜头」入口，一键重跑组装管线恢复一致）。
   - 指纹取值约定：`null` = 从未组装；`"stale"` = 曾组装但锚点已解冻；`"manual"` = 人工微调（锚定跳过、过期判定豁免）；12 位哈希 = 与当前锚点一致。
2. **视觉锚点（visualAnchor）**：英文视觉描述串，是组装管线资产段的唯一来源。派生自 lockedAppearance，由 LLM 翻译定稿，人工可改。
3. **锚点指纹（promptVersion）**：`sha256(所有引用资产的 visualAnchor + tonePrompt).slice(0,12)`。镜头完成渲染后记录指纹；资产锚点变动 → 指纹失配 → 该镜头在故事板上标「锚点过期」，提示重渲。这让「改了角色长相 → 哪些镜头受影响」变成可计算的。
4. **参考图注入（v2.4.2 接线）**：资产定妆图（portraitUrl）作为图生视频的首帧参考输入（image_url）。规则：
   - **主要角色选取**：dispatcher 在提交 video 任务前，解析镜头绑定的 character 资产（与 voiceover 的音色解析同源逻辑），取第一张已定妆（portraitUrl 非空）的角色；
   - **公网可达**：外部通道无法回源本地相对路径，首帧地址 = `PUBLIC_ASSETS_BASE_URL + portraitUrl`（L2 运行参数，默认空 = 不注入，文本锚点兜底）；portraitUrl 本身已是绝对 http(s) 地址时直接使用；
   - **优雅降级**：通道对 image_url 不接受（4xx 非 429）时，provider 自动去参重提一次，本镜退回纯文本锚点，任务不失败；降级事实 console.warn 留痕（运维观测项），不污染任务状态语义；
   - **不注入 ≠ 不一致**：未配置回源基址或资产未定妆时，提示词内的视觉锚点串兜底（与既有行为完全一致）。
5. **角色文化一致性（v2.4 → v2.4.1 强化）**：题材库全部为国内短剧题材，全链路强制单一文化面孔，不允许模型自由发挥。约束分三道防线，全部集中在 L3 模板层（`src/config/templates.ts`）：
   - **防线一（选角提示词）**：选角阶段提示词注入 CASTING_FACE_RULE——全部角色为华人面孔、锚点串必须含 ethnicity 描述，严禁欧美/混血面孔；
   - **防线二（解析兜底，v2.4.1 新增）**：`parseCasting` 落库前对每个 character 的 visualAnchor 做 ethnicity 关键词校验（ETHNICITY_KEYWORDS，大小写不敏感），缺失时自动在描述末尾追加 ETHNICITY_FALLBACK——不信任 LLM 遵守提示词，兜底是确定性的；
   - **防线三（定妆提示词）**：人物类资产定妆提示词尾缀统一注入 CHARACTER_ETHNICITY_POSITIVE + CHARACTER_ETHNICITY_NEGATIVE（正向 + 负向双向约束，PORTRAIT_CHARACTER_TAIL 由两者组合而成）；
   - **历史资产**：规则上线前生成的资产不含人种描述，通过资产库「重新生成定妆」或重跑流水线刷新，不做静默改写。

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
- `video` → `updateClip(clipId, { status: "ready", mediaUrl, durationMs })`；提交前解析镜头主要角色定妆图为首帧参考（§7.1.4：`PUBLIC_ASSETS_BASE_URL` 非空时注入，通道拒绝时自动降级）
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

- `createProvider(kind, options)` 工厂是唯一出口；业务层（服务层）永远面向 `Provider` 接口编程，替换底层模型不改业务代码；
- 现有 `noopAdapter` 语义并入 `ZaiVideoProvider` 不可用分支，避免双轨。

**通道缺省策略（配额墙根除，v2.4.3）**：

- **视频通道缺省 = noop 占位**（`VIDEO_PROVIDER` 未设置或为 `noop`）：批量出片/一键渲染全片只消耗文本与图像配额，视频任务立即以可读原因落 failed（提示可在任务中心查看，镜头可手动贴片），**永不撞视频配额墙**；
- **真实通道为显式 opt-in**：仅当环境变量 `VIDEO_PROVIDER=zai` 时启用异步任务制真实视频通道（含首帧参考图注入 §7.1.4、429 指数退避、提交节流）；运维决策接入时机（配额窗口/计费评估后）再开，而非默认烧配额；
- 依据：视频通道配额昂贵且限流敏感（实测批量提交触发 429），而流水线的完整性与可复制性不依赖真机视频——占位模式下「拆镜→定妆→锚定→配音→合成」全链路仍可验收，真机出片只是锦上添花的最后一公里；
- 与 §7.9 一键成片的关系：noop 模式下 render-all 依然全量提交（幂等），镜头快速落 failed + 引导文案，用户可按镜头手动贴片后正常合成——创作流不阻塞。

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

### 7.8 配置中心与零硬编码落地

**配置分层**：所有可调参数与文案按「谁会改它」分四层，各层位置与覆盖方式固定：

| 层 | 位置 | 内容 | 覆盖方式 |
| --- | --- | --- | --- |
| L1 创作预设 | `src/lib/genres.ts`、`src/lib/drama.ts`（GENRES / CAMERA_MOVEMENTS / RUN_STAGES / CREW_ROLES / NARRATIVE_META） | 创作方法论的数据化：题材策略、运镜库、流水线阶段、剧组角色、叙事结构 | 随产品迭代演进（版本管理） |
| L2 运行时参数 | `src/config/runtime.ts` | 调度器各通道并发上限、调度 tick 间隔、孤儿任务回收窗口、默认重试上限、列表分页、限流退避（429 指数退避 20s/40s/80s）、参考图公网回源基址（PUBLIC_ASSETS_BASE_URL，空 = 不注入首帧参考，文本锚点兜底）、成片音频参数（响度归一 LOUDNORM_I/-TP/-LRA；BGM 基础增益 BGM_VOLUME、侧链闪避强度 BGM_DUCK_AMOUNT、上传大小上限 BGM_MAX_BYTES）、成片画幅参数（v2.5：COMPOSE_FPS、分辨率档位→像素映射 composeDimensions）、转场时长（TRANSITION_SECONDS） | 环境变量覆盖（`DISPATCH_*` / `RATE_LIMIT_*` / `PUBLIC_ASSETS_BASE_URL` / `LOUDNORM_*` / `BGM_*` / `COMPOSE_FPS` / `TRANSITION_SECONDS`），带类型化默认值 |
| L3 模板文案 | `src/config/templates.ts` | 定妆图尺寸表与提示词模板（含角色专用尾缀）、提示词分段标签、技术段尾缀文案、选角面孔统一规则（CASTING_FACE_RULE）、拆镜档位（BREAKDOWN_SPEC：每幕镜头数/单镜时长/整集目标时长；当前精简档 3~4 镜/幕 × 4~5s，约 40~60 秒集）、全片调色预设表（v2.5 GRADE_PRESETS：题材 id → ffmpeg 滤镜串 + 中文说明，neutral 兜底） | 版本管理；后续可扩展为每项目覆盖 |
| L4 用户配置 | 项目级字段（v2.5 起步：Project.transitionMode / Project.gradePreset） | 终端用户对默认参数的覆盖：转场策略（cut/fade/auto）、全片调色预设（空 = 跟随题材影调） | 落库，PATCH /api/projects/[id] 写入，compose 时服务层读取 |

**规则（review 阻断项）**：

1. 业务代码出现魔法数字或内嵌模板文案 = 违反本原则；新增参数必须先在配置层登记；
2. `process.env` 只允许三处出现：`src/config/`、Provider 工厂（通道选择）、Prisma 单例样板（`NODE_ENV` 热重载判断）；业务参数读取一律经 `src/config/`；
3. 配置项必须带 TypeScript 类型与注释（含义、单位、默认值、覆盖变量名）；
4. 配置层只做「读取 + 类型化」，不含业务逻辑；禁止依赖服务层实现（仅允许对 Provider 契约类型的 type-only 导入，如 `ImageSize`）。

---

### 7.9 一键成片链路（v2.4）

> 产品语义：流水线产出制作包后，用户不应逐镜手点渲染再自行找工具拼接。
> 「一键成片」把 **批量渲染 → 自动合成 → 播放器看片** 收敛为两个动作。

**链路**：

1. **渲染全片** `POST /api/projects/[id]/render-all`（幂等）：
   - 为全部非 `ready` 镜头提交 `video` 任务；为有台词字幕的镜头提交 `voiceover` 任务；
   - 已有 queued/running 同类任务的镜头跳过（幂等去重），返回 `{ submitted, skipped }`；
   - 后续进度由任务中心轮询观测，前端以「镜头 ready 数 / 总数」展示渲染进度条。
2. **成片合成** `POST /api/projects/[id]/compose`：
   - 前置校验：全部镜头 `ready`（缺片则 409 并返回缺失清单，不产半成品）；
   - 执行体：`scripts/assemble-episode.py`（ffmpeg）——片头卡（剧名+集号，PIL 绘制 + 缓推）→
     逐镜按 plannedMs 裁剪拼接 → **转场矩阵（v2.5 §7.11，按叙事功能选型）→ 全片调色（v2.5，题材影调预设，字幕烧录前作用）→**
     字幕轨烧录（ASS，金句大字样式）→ 配音 WAV 按轨起止混音 →
     **BGM 循环铺底 + 对白侧链自动闪避（v2.4.4）→ 末级 EBU R128 响度归一（loudnorm 两遍法：
     测量遍仅解码音频秒级完成，线性模式增益恒定不抽泵）**；
     合成参数由 `compose-service.ts` 从 L2/L3/L4 读取后经 CLI 参数传入脚本（脚本自身零硬编码）：
     音频参数（v2.4.4）+ 画幅参数 `--width/--height/--fps`（v2.5，由项目 aspectRatio × resolution 映射，
     消除「UI 可选 1080p 而成片写死 720p」的选项造假）+ 转场 `--transitions/--transition-duration`（v2.5）
     + 调色 `--grade-filter`（v2.5）；
   - 产物落 `public/assets/final_{projectId}.mp4`（自包含，不受外链过期影响），
     并回写 `Project.finalVideoUrl`；响应返回 `{ finalVideoUrl, clipCount, durationSec, withVoice, withBgm }`；
   - 重跑即重合成（覆盖旧成片），镜头轨变更后可重复执行。
3. **BGM 素材管理** `POST/GET/DELETE /api/projects/[id]/bgm`（v2.4.4）：
   - 上传音频文件（multipart），校验大小（BGM_MAX_BYTES）与 MIME 白名单，落 `public/assets/bgm_{projectId}.{ext}` + 同名 `.json` 元数据（原始文件名/大小/时间）；
   - GET 返回 `{ exists, name, sizeBytes }`（面板加载时回显状态）；DELETE 清除音频与元数据；
   - 合成时若存在 BGM 文件则自动混入：循环铺满全片 → 基础增益（BGM_VOLUME）→ 以配音轨为侧链源自动闪避（对白出现时压低，静默时抬起）；无 BGM 时行为与 v2.4.3 完全一致（回归无差）。
4. **前端成片页签**：流水线成功后默认展示「成片」——播放器（9:16）+ 渲染进度 + 一键渲染/合成/下载 + 后期风格行（转场策略 + 调色预设两个下拉，v2.5）+ BGM 管理行（上传/回显/清除，v2.4.4）；
   渲染进行中自动轮询，全部就绪自动触发合成。

**约束**：
- compose 同步执行（ffmpeg 数十秒量级），请求方需等待；超时/失败返回可读错误，不写入 finalVideoUrl；
- 配音轨为空且无 BGM 时成片为无声视频（能力不回退）；仅 BGM 时归一后输出；字幕轨由流水线后期阶段确定性生成，无需人工对轴；
- BGM 素材由用户自行提供并对版权负责（产品不内置任何音乐素材，见 §11 风险表）。

---

### 7.10 工作台交互规范（v2.4.1）

> 用户反馈三大痛点：滚动太多、视频生成交互不直观、缺最终结果。本节固化为 review 阻断规范。

**滚动规则（阻断项）**：
- 桌面端（lg+）工作台锁定视口高度：顶栏固定、main 占满剩余高度且不滚动、左列与右列各自独立内滚（overflow-y-auto）；
- 页脚仅在移动端展示；桌面端信息收进各页签内容底部；
- 任意页签内容超出视口必须产生内滚条，不允许撑开整页高度；页签切换重置内滚位置。

**分镜表密度（阻断项）**：
- 分镜表按幕分组，每组默认折叠（摘要行：幕名 · 叙事功能 · 镜头数 · 就绪数 · 总时长），点击展开镜头行；
- 单个幕展开时镜头行才全量渲染，禁止默认全展开长列表。

**视频生成入口（功能规范）**：
- 全局出口：成片页签「一键渲染全片」（render-all，含配音）不变；
- 单镜出口：分镜表行内「渲染此镜」按钮——仅对已锚定（finalPrompt 非空）且非 ready 的镜头开放，提交 `createTask("video", { clipId })`；服务端幂等去重（同一镜头活跃任务不重复提交），前端依据任务列表对在途镜头禁用按钮；
- 状态可见：镜头行实时反映渲染状态徽标（在途/失败重试入口指向剧组进程任务中心），成片页签汇总进度；
- 结果出口唯一：成片页签播放器是最终结果的唯一展示位（播放/下载/重合成），渲染完成后自动切换并自动合成。

---

### 7.11 成片视觉专业化：转场矩阵与全片调色（v2.5）

> v2.4.x 成片为**硬切拼接 + 原始直出**：镜头间无转场语义、全片无色彩管理，
> 与「专业交付」的产品定位不符。v2.5 在合成链补齐两件事，均为纯 ffmpeg 本地处理（零配额消耗）。

**① 转场矩阵（Project.transitionMode，默认 `auto`）**：

| 策略 | 值 | 语义 |
| --- | --- | --- |
| 硬切 | `cut` | 与 v2.4 行为一致（concat 直拼，零重编码回归无差） |
| 全片溶解 | `fade` | 全部相邻片段间交叉溶解（xfade=fade） |
| 智能矩阵 | `auto` | 按叙事功能选型（下表），转场时长 TRANSITION_SECONDS（默认 0.5s） |

智能矩阵（`auto`）选型依据——转场是叙事语言，不是随机特效：

| 剪辑点 | 转场 | 叙事理由 |
| --- | --- | --- |
| 片头卡 → 第一镜 | 交叉溶解 fade | 入戏缓冲，剧名淡出画面淡入 |
| 同幕内镜头间 | 硬切 | 短剧节奏主语言，动作连续性优先 |
| 幕界 → 进入 hook | 硬切 | 开场冲突直接砸脸，溶解会泄劲 |
| 幕界 → 进入 climax | 硬切 | 高潮点硬切本身就是剪辑冲击 |
| 幕界 → 进入 cliffhanger | 压黑 fadeblack | 章节收束感，留悬念呼吸 |

工程实现：`cut` 走 concat -c copy（零重编码）；`fade`/`auto` 改走 filter_complex
xfade 链（逐段叠加 offset，全部片段统一编码规格后溶解），仅重编码一次；
叙事功能从 timeline_clips.beatIndex → story_beats.narrativeFunction 连表取得。

**② 全片调色（Project.gradePreset，空 = 跟随题材影调）**：

- L3 层登记 `GRADE_PRESETS`：题材 id → ffmpeg 滤镜串（eq 基础对比/饱和/亮度 + colorbalance
  冷暖偏移）+ 中文说明，另含 `neutral`（无滤镜）兜底；题材快照的英文 tonePrompt 只进生成提示词，
  **成片调色是独立维度**，由预设表显式映射，避免用提示词做 fragile 的关键词匹配；
- 用户可在成片页签「后期风格」下拉覆写为任一预设（L4 落库）；选「跟随题材」时按项目 genreId 取预设；
- 滤镜串经 CLI `--grade-filter` 传入脚本（脚本零硬编码，§7.8 规则）；作用点在**字幕烧录之前**
  （`vf = "<grade>,ass=…"`），保证字幕白字不受调色污染。

**约束**：

- 全片统一一个预设，不做镜头级分级（镜头级调色属 AIGC 出片波动补偿，需逐镜审片，超出当前档位）；
- 调色滤镜串来自 L3 白名单，不接受任意字符串注入（compose-service 只传预设命中项）；
- 转场/调色均不改变响度归一与字幕轨语义；不传新参数时与 v2.4.4 行为一致（回归无差）。

---

### 7.12 镜间背景一致性：首帧参考源优先级（v2.5）

> v2.4.2 参考图注入只取 character 定妆图：人物跨镜一致，但**空镜/转场镜头（无角色出场）
> 无首帧参考**，场景背景完全依赖提示词锚点——这是跨镜背景跳变的主因。
> scene 资产的定妆图规格（1344x768）自 v2.0 就存在，只是从未参与注入。

**规则（resolveFirstFrameUrl 优先级）**：

1. 镜头绑定的第一张已定妆 `character` 资产（v2.4.2 行为，人物面孔优先——脸穿帮比背景穿帮更刺眼）；
2. 未命中时回退：镜头绑定的第一张已定妆 `scene` 资产（空镜/转场镜头的场景锚定）；
3. 仍未命中 → undefined，提示词锚点串兜底（既有行为）。

**边界**：

- scene 定妆图为 16:9 横幅而视频为 9:16 竖幅：首帧参考是**语义参考**而非逐像素贴片，
  通道侧自行构图；文档明确此差异，不做横转竖裁切（裁切会破坏场景完整性）；
- prop 资产不参与首帧注入（道具锚点由提示词串承载，避免抢主体）。

### 7.13 工作台视觉纪律：色彩收敛与信息架构（v2.5.1）

> VLM 设计总监评审（1440x900 实拍）：首页 6/10。行业调性与骨架成立，但存在四类结构问题：
> ① 色彩失控——五阶段卡/能力亮点/题材未选中态/剧组岗位共 5 组色相无规则混用；
> ② 编号语言割裂——左列「第一步/第二步」胶囊 vs 右栏「01-05」mono 两套体系；
> ③ 主 CTA 弱——「一键成片」埋在能力列表末位且与次要功能同质化；
> ④ 装饰噪音——顶栏「9:16 竖屏短剧工作台」徽标语义不明，手机预览缺状态语境。

**色彩纪律令（设计令牌级约束，长期有效）**：

1. **唯一高饱和主色**：品牌「胶片橙红」渐变（red-600→rose-600→amber-500），仅用于
   logo、全局主 CTA、进度主轴与选中态描边；
2. **题材身份色是内容色而非 UI 色**：题材卡**选中态**保留题材渐变（作品封面语义），
   未选中态图标一律中性灰（`text-muted-foreground`），不跟随题材色相；
3. **单一强调色**：琥珀 `amber-400` 为唯一强调色（进行中/提示/装饰图标）；
   语义色仅用于状态——emerald 成功 / rose 失败 / amber 进行中，不得用于装饰；
4. **剧组岗位色降级为数据层属性**：`CREW_ROLES[*].color` 保留（数据完整性），但
   首页导览与卡片渲染不再逐角色取色，统一 amber 或中性，消除五色卡片墙。

**信息架构修正**：

- **编号统一**：左列步骤卡改「01/02/03」mono 等宽序号，与右栏流水线「01-05」同一语言；
- **CTA 层级**：左列「全组开机」为全局唯一渐变主 CTA；能力亮点区「一键成片 ffmpeg」
  升级为 accent 卡（amber 细边框 + 微底色 + 品牌色图标），其余能力卡中性化——
  第一屏必须能回答「这产品最重要的动作是什么」；
- **手机预览语境化**：加 REC 呼吸红点与「开机后自动产出」标注，从孤立装饰变为
  产品承诺的可视化；
- **顶栏降噪**：移除「9:16 竖屏短剧工作台」装饰徽标（信息已在左列配置与预览中
  表达），顶栏只保留品牌、版本徽标、项目库；
- **底条版本同步**：数据规模尾条版本号与发布号一致（v2.5.0）。

**健壮性（P0 阻断修复）**：

- 剧组日志渲染防御式降级：journal 为 DB JSON 直读，条目 `role` 键失效/缺失/脏数据时
  降级为中性「剧组」标签 + 中性色，**禁止组件层裸取 `CREW_ROLES[entry.role].color`**
  （实拍触发 `Cannot read properties of undefined` 白屏，剧组进程页签完全不可用）；
- 同类裸取审计：`TASK_STATUS[task.status]`、`TASK_KIND_META[task.kind]`、
  `RUN_STATUS[run.status]` 均为枚举白名单直读，属可控；仅 journal 需要防护。

**v2.5.2 补则（会话工作台四轮 VLM 走查沉淀）**：

- **危险操作三件套**：破坏性重写类操作（重新开机/重写剧本分镜）一律
  红色描边 + AlertTriangle 图标 + AlertDialog 二次确认（红色顶边、警示标题、
  文案必须写明「重写什么 / 保留什么 / 不可撤销」）——品牌渐变与 amber 实底
  禁止用于任何破坏性入口，红色实底仅出现在确认弹窗的最终执行钮上；
- **状态单一真相源**：「成片产出」等展示态一律取产品事实字段（`finalVideoUrl`），
  禁止用派生统计（如「全部镜头 ready」）冒充产出态——镜头就绪度（9/10）独立展示；
- **参数格两行栅格**：键值信息用「标签上（10px 灰）/ 值下（12px 亮 + tabular-nums）」
  两行结构，2 列宽格起步，值禁止换行与截断（tooltip 兜底）；状态值用徽标而非裸文本；
- **工作区底板**：会话态右列为全高圆角表面，内容短于视口时呈现为「空工作面」
  而非「悬空卡片 + 纯黑空洞」；页签激活态 = 深底反白片 + 2px amber 底部指示条。

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
| POST `/api/projects/[id]/anchor` | 重新锚定：全部非人工微调镜头重跑组装管线（解冻恢复入口） | **新增 v2.0** |
| GET `/api/tasks?projectId=&status=` | 任务列表（轮询，`Cache-Control: no-store`） | **新增 v2.1** |
| GET/POST `/api/tasks/[id]` `/retry` `/cancel` | 任务详情 / 重试 / 取消 | **新增 v2.1** |
| GET `/api/projects/[id]/energy-curve` | 能量曲线点集 | **新增 v2.2** |
| GET/POST/PATCH/DELETE `/api/projects/[id]/tracks` | 轨道项 CRUD（按 kind 过滤） | **新增 v2.2** |
| GET `/api/projects/[id]/export` | 导出 JSON（tracks 可选段追加） | 扩展 |
| POST `/api/series` + GET `/api/series/[id]` | 系列创建 / 详情（含剧集列表） | **新增 v2.3** |
| POST `/api/projects/[id]/render-all` | 一键渲染全片：批量提交 video + voiceover 任务（幂等去重） | **新增 v2.4** |
| POST `/api/projects/[id]/compose` | 成片合成：ffmpeg 片头卡/转场矩阵/调色/字幕烧录/配音混音，回写 finalVideoUrl | **新增 v2.4，v2.5 扩展** |
| POST/GET/DELETE `/api/projects/[id]/bgm` | BGM 上传（大小/MIME 校验）/ 状态回显 / 清除；合成时循环混入+侧链闪避 | **新增 v2.4.4** |
| PATCH `/api/projects/[id]`（扩展字段） | `transitionMode`（cut/fade/auto）与 `gradePreset`（GRADE_PRESETS 键或 null=跟随题材）写入项目，compose 时生效 | **扩展 v2.5** |

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
├── config/                         # 集中配置层（§7.8）：runtime.ts 运行参数 / templates.ts 模板文案
├── lib/
│   ├── drama.ts                    # DTO + 运镜库 + 剧组流水线定义 + 导出（保留，增量扩展）
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

### v2.0 —— 资产库与锚定地基（纯数据 + 组装，无外部通道）✅ 已实施
1. Prisma 迁移：Asset / ShotRef + TimelineClip/StoryBeat 加列；
2. `asset-service` + 资产 API + 解冻保护（stale 标记 + /anchor 重新锚定入口）；
3. `prompt-engine`（纯函数 + 单测：组装顺序、指纹、分段）；
4. breakdown-service 输出协议升级：每镜头输出引用资产名/energy/sfxHint（LLM 提示词同步升级）；
5. 工作区页面骨架 `/project/[id]`：故事板视图 + 资产面板（建/绑/改/删）+ 镜头卡显示 finalPrompt 分段。
**验收**：建角色 → 绑定到镜头 → 组装出带锚点的 finalPrompt；改角色锚点 → 镜头标「锚点过期」。

### v2.1 —— 任务管线与视频接入 ✅ 已实施（视频通道当前为 noop 降级，接口就绪）
1. RenderTask 迁移 + `task-service` + 任务 API；
2. `dispatcher`（内存队列 + 并发 + 重试 + 重启恢复）+ 四类 handler；
3. `ZaiVideoProvider`（video.generations + async.result.query 轮询）+ `ZaiImageProvider`（定妆图）；
4. 前端任务中心：提交/轮询/重试/取消，镜头状态与任务状态联动。
**验收**：镜头一键渲染 → 任务流转 → mediaUrl 回写故事板；断网/超时 → failed + 可重试；进程重启 → running 任务自动恢复。

### v2.2 —— 轨道、能量曲线与配音 ✅ 数据层与拆镜协议已实施（TTS 通道待接入）
1. TrackItem 迁移 + track-service + 轨道 API；
2. 拆镜产物自动落三轨；能量曲线 API + 前端曲线图 + 节奏预警；
3. `ZaiAudioProvider`（TTS）+ voiceProfile 编辑 UI + 配音任务接入。
**验收**：全集能量曲线可见且与幕结构吻合；金句字幕带变色关键词；台词音频落轨。

### v2.2.5 —— 零硬编码整改 ✅ 已实施
1. 新建 `src/config/runtime.ts`（调度并发/tick/回收窗口/重试上限，环境变量可覆盖）与 `src/config/templates.ts`（定妆尺寸表、定妆提示词模板、提示词分段标签）；
2. dispatcher / prompt-engine 全部改读配置，消灭魔法数字；
3. review 规则写入 §7.8：业务代码禁止 `process.env`、魔法数字与内嵌文案。
**验收**：`rg -n "process.env" src/ | rg -v config` 仅命中 Provider 工厂；调度参数改环境变量即生效。

### v2.3 —— 多剧集与批量生产 ✅ 已实施（3 集系列 E2E 实测通过）
1. Series 表 + Project 挂 seriesId/episodeNo + 资产克隆（含定妆图地址引用，跨集视觉一致）；
2. 项目库系列分组视图（系列头 + 第 N 集徽标）；
3. 系列级批量提交（portrait 补定妆 / video 渲染待拍镜头，单任务幂等去重）；
4. 附带补齐：GET /api/tasks 列表路由、GET /api/projects/[id]/export、文本通道 429 指数退避、拆镜档位配置化（60 秒集档位 BREAKDOWN_SPEC）。
**验收**：一个系列 3 集、共享视觉基调，资产一键继承，批量提交后任务中心统一观测。✅ 已按此验收实测（见 scripts/e2e-series.sh）

### v2.4 —— 精简档位与一键成片 ✅ 已实施
1. 拆镜精简档位：BREAKDOWN_SPEC 调整为每幕 3~4 镜 × 4~5s（整集约 40~60 秒），修复 plannedMs 钳制与档位不一致的缺陷；
2. 选角面孔统一：CASTING_FACE_RULE 写入选角阶段提示词，全部角色锚点强制华人面孔（国内题材一致性）；
3. 渲染全片 `render-all` API（幂等去重）+ 成片合成 `compose` API（ffmpeg）+ `Project.finalVideoUrl` 持久化；
4. 前端 Tab 化信息架构：成片（播放器优先）/ 分镜剧本 / 资产定妆 / 节奏轨道 / 剧组进程，左列配置开机后自动折叠，消除超长滚动。
**验收**：流水线成功 → 一键渲染全片 → 自动合成 → 播放器直出 9:16 成片；人物形象全程华人面孔。

### v2.4.1 —— 角色文化一致性兜底与工作台交互收敛 ✅ 已实施
1. 模板层新增 CHARACTER_ETHNICITY_POSITIVE / NEGATIVE / ETHNICITY_FALLBACK / ETHNICITY_KEYWORDS，PORTRAIT_CHARACTER_TAIL 改为正负约束组合；
2. parseCasting 兜底校验：character 视觉锚点缺 ethnicity 关键词时自动注入 ETHNICITY_FALLBACK（防线二）；
3. 工作台交互规范落地：桌面端视口内滚动（双列各自内滚）、分镜表按幕默认折叠、行内「渲染此镜」入口、渲染中状态徽标；
4. 后期成包阶段自动补定妆：开机成功后缺 portraitUrl 的资产自动提交 portrait 任务（复用 task-service 幂等去重），消除「资产页签全占位」的交互断层；
5. 端到端复验第一集：选角→定妆→渲染→合成全链路跑通，截图核对人物面孔统一、页面无超长滚动；配额受限场景验证流水线与交互而非量产。
**验收**：新立项项目开机后无需手动点击，定妆图自动陆续出片；全角色锚点含 ethnicity；分镜表默认折叠后 script 页签无内层长滚动；单镜可独立提交渲染并联动进度。

### v2.4.2 —— 参考图注入接线 ✅ 已实施（E2E 阶段B 待视频通道配额窗口恢复）
1. dispatcher video handler：解析镜头主要角色定妆图，`PUBLIC_ASSETS_BASE_URL` 非空时构造公网首帧地址注入 provider（§7.1.4）；
2. ZaiVideoProvider：image_url 遭通道拒绝（4xx 非 429）时自动去参重提一次，降级留痕不失败；
3. L2 配置登记 PUBLIC_ASSETS_BASE_URL（默认空 = 关闭，行为与 v2.4.1 完全一致，零风险合入）；
4. E2E：公网回源基址可用时验证「同角色跨镜头面孔一致」的参考图增益（抽帧对比定妆图）。
**验收**：阶段A回归已通过（全新项目全流水线 + 6/6 定妆照华人面孔 PASS，`scripts/e2e-fresh-pipeline.sh`）；阶段B（参考图实拍验证，`scripts/e2e-refimg-drive.sh`）就绪待通道配额；不配置基址时行为与上一版本完全一致（回归无差，阶段A已证）。

### v2.4.4 —— 成片音频专业化：响度归一 + BGM 轨 ✅ 已实施
1. **末级响度归一（P1-1）**：合成链混音后统一过 `loudnorm`（EBU R128 流媒体标准）——**两遍法**：第一遍仅对混音轨解码测量（input_i/TP/LRA/thresh，秒级），第二遍以 `measured_* + linear=true` 精确归一到 -16 LUFS / TP -1.5dB / LRA 11；三处工程保障（均为实测踩坑后修正）：① 目标 LRA 取 `max(配置值, 实测 LRA)` 保证线性模式生效；② 第二遍 loudnorm 的 TP 参数按预估增益抬高（上限 0dBFS）——**loudnorm 线性模式内部仍会按自身 TP 参数回撤增益，后置限幅器无法弥补，实测 -18.8 LUFS**；③ 真峰值限制由后置 `alimiter`（阈值=TP 目标）强制执行，实测最终命中 -16±0.5 LUFS；参数 L2 可配（LOUDNORM_I/-TP/-LRA）；
2. **BGM 音乐轨（P1-2，三轨合成的第三轨补齐）**：`POST/GET/DELETE /api/projects/[id]/bgm` 上传管理；合成时 `-stream_loop` 循环铺满全片、基础增益 BGM_VOLUME（默认 0.14 ≈ -17dB）、以配音混音轨为侧链源 `sidechaincompress` 自动闪避（对白出现压低、静默抬起，强度 BGM_DUCK_AMOUNT）；
3. **成片面板 BGM 管理行**：上传/文件名回显/清除，与一键合成同页；
4. **零配额纪律**：本阶段全部为本地 ffmpeg 处理，零外部通道调用；合成参数经 CLI 传入 Python 脚本，脚本自身零硬编码（§3 第 7 条）。
**验收**：以第一集既有资产本地重合成（零配额）：无 BGM 时 loudnorm 后响度达标（±1 LU）；有 BGM 时对白可懂度不降（闪避生效）、BGM 全片连续；eslint / tsc 零错误；不传参时脚本行为与 v2.4.3 一致（回归无差）。

### v2.5 —— 成片视觉专业化：转场矩阵 + 全片调色 + 画幅贯通 + 背景一致性 ✅ 已实施
1. **转场矩阵（P0-3）**：Project.transitionMode（cut/fade/auto，默认 auto）；智能矩阵按叙事功能选型（片头卡溶解入戏、同幕硬切、cliffhanger 压黑收束）；cut 走 concat 零重编码回归无差，fade/auto 走 xfade 链；转场时长 L2 可配（TRANSITION_SECONDS）；
2. **全片调色（P0-4）**：L3 登记 GRADE_PRESETS（8 题材预设 + neutral 兜底，eq+colorbalance 滤镜串）；Project.gradePreset 空 = 跟随题材、非空 = 用户覆写；滤镜串 CLI 传入脚本零硬编码；调色在字幕烧录前，字幕白字不受污染；
3. **画幅档位贯通（P0-2）**：成片分辨率由项目 aspectRatio × resolution 映射（composeDimensions），CLI --width/--height/--fps 传入脚本，消除「UI 可选 1080p 而成片写死 720x1280」的选项造假；ASS 字幕字号随画幅等比缩放；COMPOSE_FPS L2 可配；
4. **镜间背景一致性（P0-5）**：resolveFirstFrameUrl 增加场景定妆图回退（character 优先，无角色镜头回退 scene），空镜/转场镜头获得场景首帧锚定（§7.12）；
5. **工作台状态真实化（P0-6）**：幕卡「镜头产出状态」徽标由硬编码「待生成」改为按镜头轨聚合真实状态（就绪 M/N）；成片页签新增「后期风格」行（转场策略 + 调色预设，PATCH 落库）；顶栏版本号与文档版本同步（v2.5.0）；
6. **资产对账工具（P0-7）**：scripts/asset-audit.py 比对 DB 引用与 public/assets 文件，报告孤儿资产（--gc 清理）；
7. **零配额纪律**：全部为本地 ffmpeg/本地代码工作，零外部通道调用；验收用既有 clip 素材本地重合成。

**验收**：既有素材本地重合成（零配额）：1080p 档成片 ffprobe 实测 1080x1920；auto 转场在幕界/片头卡处可见 fadeblack/fade；调色后字幕区白色不偏色；cut 模式与 v2.4.4 行为一致（回归无差）；eslint / tsc 零错误。

### v2.5.2 —— 会话工作台可读性专项：参数栅格 / 危险操作 / 状态同源 ✅ 已实施
（基于 v2.5.1 种子演示数据的五页签 VLM 设计总监四轮走查：6.0~6.4 → 6.9~7.0，轮次间问题清单收敛）
1. **参数栅格重构（工程信息卡）**：单行 label/value 挤压换行 → 「标签上/值下」两行栅格；二轮复审 4 列仍截断（"Omni 1.2 Flash""5s · 1080p"）→ 2 列宽格值完整可读；状态值（提示词增强开启/关闭）用语义徽标与可调参数区分；「成片产出」三轮复审反复指出混入参数格层级不清 → 上提至标题徽标行（emerald 已合成 / 中性未合成）；
2. **状态同源修复**：产出状态原取 `hasSynthesizedOutput`（要求全部镜头 ready）与成片页签下载按钮（`finalVideoUrl`）语义矛盾（VLM 实拍：任务中心三条已完成 vs 状态卡待生成）→ 统一对齐 `finalVideoUrl` 单一真相源，镜头就绪度由成片页签「9/10 镜就绪」独立表达；
3. **危险操作防误触（§7.13 补则）**：「重新开机」为破坏性重写（覆盖剧本/分镜/锚点）——首页折叠面板与剧组进程面板两处均从品牌渐变降级为红色描边 + AlertTriangle 图标 + AlertDialog 二次确认（红色顶边 + 警示标题，文案明确「重写什么/保留什么/不可撤销」），与 amber 保存主 CTA 拉开语义；首次开机按钮保留唯一品牌渐变；遮罩加深至 bg-black/70 + backdrop-blur-sm；就绪提示与危险按钮 ml-auto 分组；
4. **色彩纪律扫尾**：清剿 fuchsia/violet 残留 5 处（定妆按钮/资产图标/日志相机图标/BGM 图标与按钮）统一 amber 或中性；资产卡「剧组建档/引用次数」徽标降级为灰阶文本（每卡仅保留类型徽标着色）；「生成定妆照」降为中性描边（amber 让位给过期警示条）；
5. **信息密度补层**：节奏页签新增「镜头级节奏带」（宽=计划时长、高=情绪能量、pending 虚线降饱和，tooltip 全量）填实镜级可扫读层；任务中心行补等宽时间戳；剧组日志时间戳定宽 52px 成列；资产网格响应式三列；台词复制图标对比度提升 + tooltip；
6. **工作区底板**：会话态右列整体升级为全高圆角表面（IDE 工作面惯例）——内容短于视口时不再呈现「悬空卡片 + 纯黑空洞」；成片视频预览加 ring 边界（黑底黑画布边界消隐修复）；页签激活态加深底反白片 + 2px amber 底部指示条 + 成片绿点 tooltip。
**遗留（v2.6 候选）**：内容密度型空洞（资产/任务下半屏）需版本历史、任务详情等真实功能填充而非装饰；三态状态模型（进行中/完成/未设置）跨页签统一需产品定义。
**验收**：tsc/eslint src/ 零错误；next build 成功；紫色系残留 rg 零命中；零外部通道调用（VLM 走图片理解，不触发生成配额）；四轮 VLM 走查问题清单从 7 项 P0/P1 高频收敛至 2 项结构类建议。

### v2.5.1 —— 工作台视觉纪律：色彩收敛 + P0 白屏修复 ✅ 已实施
1. **P0 阻断修复**：剧组日志条目 `role` 键失效时组件裸取 `CREW_ROLES[entry.role].color` 导致页签白屏（VLM 实拍审计发现）——防御式降级为中性「剧组」标签；
2. **色彩纪律（§7.13 令）**：首页五阶段卡图标统一 amber（去五色卡片墙）、能力亮点四卡中性化 + 「一键成片」accent 卡、题材未选中图标中性灰（选中态保留题材渐变=内容色）、钩子/配乐行统一 amber 强调；
3. **编号统一**：步骤卡「第一步/第二步/第三步」→「01/02/03」mono，与右栏 01-05 同语言；
4. **CTA/降噪/语境**：手机预览加 REC 呼吸点与产出标注、顶栏移除装饰徽标、底条版本同步 v2.5.0；
5. **工具**：`scripts/seed-demo-project.mjs` 零配额演示数据（3 幕/10 镜/5 资产/引用/轨道/运行/任务全量），VLM 视觉审计与截图回归的固定样本。
**验收**：tsc/eslint 零错误；剧组进程页签在脏 journal 数据下正常渲染（降级标签）；VLM 复审首页 ≥7.5/10；零外部通道调用。

### v2.4.3 —— 配额墙根除 + 工作台视觉精修 ✅ 已实施
1. **通道缺省策略翻转（§7.4）**：视频通道缺省改为 noop 占位，真实通道显式 `VIDEO_PROVIDER=zai` opt-in——批量流水线/一键渲染永不消耗视频配额，创作流与可复制性优先于真机出片；
2. **工作台视觉精修**：emoji 主视觉换统一图标体系（lucide）、题材卡选中态强化、开场双栏空态重排（消除右侧空白失衡）、行高与中英混排密度修正、按钮风格统一、深底灰字对比度提升至可读档；
3. **.env.example 通道说明**：VIDEO_PROVIDER 缺省语义写入模板，运维 opt-in 路径清晰；
4. **配音通道 429 退避补齐**：zai-voice 与 text/video 同源的指数退避（20s/40s/80s + 抖动），配额限流时任务退避重试而非直接落 failed。
**验收**：不设 VIDEO_PROVIDER 跑 render-all：视频任务全部秒级落 failed 且原因可读（零真实调用，配额零消耗）；VLM 视觉评审 ≥ 8/10；深色底正文对比度 ≥ 4.5:1。

---

## 11. 风险与边界

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 上游通道限流（429） | 流水线阶段失败、任务积压 | 文本/视频/语音三通道统一指数退避（20s/40s/80s，可配，含抖动）；流水线阶段幂等断点重试，不浪费已完成阶段；图像/视频通道并发上限独立可配 |
| 视频通道配额/速率限制 | 任务积压 | **缺省 noop 占位（v2.4.3，零配额消耗）**；真机 opt-in 后并发上限可配、失败重试退避；noop 模式允许手动贴片不阻塞创作 |
| 通道参考图能力不确定（image_url 被拒） | 首帧一致性增益丢失 | 优雅降级：provider 检测拒绝后自动去参重提，任务不失败；文本锚点串兜底（§7.1.4） |
| LLM 拆镜输出不稳定 | 镜头数据非法 | 沿用现有「围栏剥离 + 截取 JSON」解析；zod 校验失败自动重试 1 次；人工编辑兜底 |
| dev 多 worker / 热重载误触发重启恢复 | 运行中的流水线被误标 failed | 恢复逻辑只回收「过期」记录（updatedAt 落后 3 分钟），运行记录具备事实心跳；生产多实例沿用同一判据 |
| 锚点漂移（改资产引发连锁重渲） | 成本失控 | 锚点指纹只标记不自动重渲；重渲由用户显式触发 |
| SQLite 单写并发 | 任务高频回写冲突 | 调度器写操作串行化（单 worker 回写队列）；数据量增长后换 Postgres 仅改连接串 |
| 内存队列进程重启丢任务 | 任务卡 running | 启动恢复逻辑强制回置 queued（§7.3）；v3 若多实例部署再引入持久化队列 |
| 导出兼容 | 旧消费者解析失败 | 新字段全部可选、顶层结构不变；导出前跑 schema 兼容断言 |
| 内容合规 | 平台风控驳回 | 生成前沿用题材库正向约束；对外部模型接入保持「合规渠道优先」原则 |
| BGM 素材版权 | 成片投稿侵权 | 产品不内置任何音乐素材，仅支持用户上传并对版权自负（§7.9 约束）；MIME/大小白名单防滥用 |

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
