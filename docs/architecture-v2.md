# 剧集智能创编工坊 · v2 底层架构设计

> 版本：v2.9.11 ｜ 日期：2026-11-13 ｜ 状态：**v2.0～v2.9 已实施（一键成片链路 + 成片视听专业化 + 工作台可读性 + 流水线交互专项 + 各部门专业纪律 + 产品交付面：连载生产线与制作包 + 新用户首屏转化 + 端到端过程反馈 + 外部出片入库闭环 + 流水线解析可靠性与删除级联 + 异步动作反馈完备性与环境韧性 + 用户视角端到端韧性）**
> 本文档是 v2 全部扩容的唯一设计依据。实施时新建代码必须与本文的模型、接口、目录、阶段划分一致；如需偏离，先改文档再改代码。
>
> **变更记录**
> - v2.9.11：用户视角端到端韧性专项（真实创作流程实拍走查驱动：落地页→填充示例梗概→全组开机→剧组进程，零视频配额；核心发现=编剧阶段实捕上游截断×2 连续解析失败，阶段卡/警示条/日志三处同屏刷 120 字符截断 JSON）——① **repairTruncated 对象内截断兑底（P0，全流水线共用修复链）**：端到端实捕样本=LLM 输出在第一个场次对象内部断掉（无任何闭合元素可回退，旧逻辑直接 null，解析级重试也救不回同样截断的输出）——括号栈扫描同步记录最后一个「不在字符串内」的逗号锚点（位置 + 该时刻栈快照），无闭合元素可回退时退到最后一个逗号锚点按【该时刻】栈快照闭合；修出的有效 JSON 由业务层做内容充足性判定（场次 <3 判废重试）——错误语义从「解析失败」变「内容不足」，与重试提示针对性对齐；编剧/选角/分镜三处共用 parseJsonLoose 一处受益。② **解析级重试 2→3 级（编剧/选角对齐分镜最佳实践）**：SCREENPLAY_RETRY_HINTS / CASTING_RETRY_HINTS 逐级收紧，第 3 级显式降载（字符串单行/字段字数上限/JSON 完整闭合）直指截断与格式两类根因——连续 2 次截断的实捕失败在 3 级重试下存活率显著提升。③ **finish_reason 透传（P1）**：TextResult 增 finishReason（zai-text 从 choice.finish_reason 透传），解析失败时定性「被截断」vs「格式异常」，不再肉眼猜；UI 错误消息直接说「AI 返回内容被截断」。④ **stage.error 人话化（P1）**：ParseFailError（message 给 UI 人话，detail 原始输出摘要落剧组日志——对齐 BreakdownError 既有约定）：阶段卡/警示条不再刷 120 字符截断 JSON，换成「AI 返回内容被截断（已连续重试仍无法解析）——点击「断点续拍」重新生成」；日志诊断行含原始输出长度 + finish_reason + 首尾各 50 字。⑤ **版本徽标漂移修复（P2）**：APP_VERSION 停在 v2.9.8（v2.9.9~v2.9.10 改版未同步），落地页顶栏徽标与实际代码版本脱节——v2.9.11 同步并固记「改版必改此处」纪律。验收：verify-json-repair.mjs 21/21（新增 5 断言：实捕样本修出有效 JSON/字符串内截断退前锚点/无锚点极端截断仍 null 不误修/v2.9.9 旧用例语义不变/正常嵌套不受锚点逻辑影响）+ tsc 零错误 + 浏览器实拍回归（断点续拍真实重跑全绿）。
> - v2.9.10：异步动作反馈完备性与环境韧性（26 个用户可点击异步动作全量审计驱动：8 缺口 + 4 可疑项——「点击后转圈无反馈/静默失败」的四类残存来源）——① **一键渲染全片在途态（P0）**：POST /render-all 批量建任务慢网下数秒无反馈且可连点重复提交——store `renderingAll` + 防重入 + 按钮转圈/禁用/文案变化。② **任务中心重试/取消失败播报（P1）**：官方指定失败恢复入口 catch 静默吞（「点了没反应」）——retryTask/cancelTask 返回错误信息，行内图标在途转圈，失败 destructive toast。③ **断点续拍在途态（P1）**：run 失败后用户最急时刻可连点双发 retry——`retryingPipeline` + 禁用/转圈。④ **项目删除二次确认（P1）**：不可逆清除整集工程却无确认（「重新开机」有 AlertDialog 而删除没有）——补 AlertDialog + 在途态 + 「另起新片」替代路径提示；载入/重命名同步补防重入。⑤ **行内小动作（P2）**：加入镜头轨/分镜表上移下移重置删除补在途态；场次运镜切换 fire-and-forget 却立即报「已切换」的误导性成功提示——改为入库同步结果决定播报口径。⑥ **可疑项**：合成错误「重试」从「仅清错误依赖 effect 重触发」（allReady 不成立时点了没反应）改显式调 handleCompose；BGM 更换/清除补转圈；两处「重写并开机」AlertDialog 点后立即关闭的 1~2s 无反馈空档——改弹窗内等开机指令落定。⑦ **合成 Python 解释器解析（环境韧性）**：assemble-episode.py 依赖 PIL，dev server 子进程 PATH 解析可能落在无 PIL 的系统 python（沙箱回收后 venv 重建差异，实测合成 500）——resolvePython 三级解析（DRAMA_PYTHON 显式覆写 > ~/.venv/bin/python3 > PATH python3）。验收：verify-v2910.mjs 19/19（全新，零外部配额：route mock 延迟注入测在途态 + Prisma 直写构造 failed run/queued/failed 任务；含发现 mock 返回 running 后真实轮询翻回 failed 触发 v2.9.7 中断自动切页签的产品正确行为需在测试中等具落定）；全量回归 14 脚本全绿（v293 12/12 + v295 16/16 + v296 14/14 + v297 16/16 + v297批次 4/4 + v298 17/17（合成修复后复跑） + approved-boot 13/13 + serial-landing 全过 + seed-protocol 102/102 + delete-cascade 10/10 + json-repair 16/16）+ tsc 零错误 + 零 pageerror。
> - v2.9.9：流水线解析可靠性与删除级联（全量验收复跑驱动：journey 面复跑拆镜阶段真实失败「AI 分镜拆解结果解析失败」暴露两处硬伤）——① **parseJsonLoose 修复链（P0，全流水线 LLM 结构化输出共用）**：原实现仅围栏剥离+首尾花括号截取，四类高频失败形态全部无解：顶层数组（模型忽略「包一层对象」指令）、尾逗号、字符串内裸换行/制表（JSON.parse 硬错误，视觉描述文案不罕见）、max_tokens 截断（输出被切断后尾部无闭合）——重构为六级修复链：围栏剥离 → 顶层数组直取 → 首尾花括号+直接解析 → 尾逗号清理 → 字符串内裸控制字符转义（状态机，字面量外原样保留） → 截断修复（括号栈扫描回退到最后一个完整元素，按【该时刻】栈快照补全闭合——不能用扫描终态栈，残片元素的开括号在切片之外，按终态闭合会多补；单测抓出）。三形态兑底：顶层数组/对象/前缀文本+数组。② **拆镜解析级重试 2→3 次（P0）**：第三次指令显式要求「字符串单行、无尾逗号、visualDesc ≤40 字、JSON 完整闭合」直指截断与格式两类根因；parseShots 兼容顶层数组。③ **阶段失败可诊断（P1）**：BreakdownError.detail（模型原始输出片段）此前被 stage catch 丢弃——「解析失败请重试」永远无从诊断；现落剧组日志（run.error 保持干净给 UI），下次失败形态可直接定位。④ **deleteProject 磁盘级联（P0，运维缺口）**：删除项目只级联删 DB 行，磁盘素材全成孤儿且手工清理高危（实操中曾用 asset_{id} 命名推导而非真实引用字段 Asset.portraitUrl，险些误删种子项目定妆照，从 git HEAD 恢复）——现删行前收齐全部素材引用（portraitUrl/mediaUrl/resultUrl/finalVideoUrl+封面帧 _poster.jpg 派生/BGM 约定对 bgm_{pid}.*），行删成功后 best-effort 清盘，路径解析限定 ASSETS_DIR 内防穿越，跨项目零误伤。验收：verify-json-repair.mjs 16/16（零配额：六类失败形态+不误修复）+ verify-delete-cascade.mjs 10/10（零配额：镜头成片/BGM 对级联清除+种子文件零误伤+DB 级联+幂等 404）+ verify-v297-journey.cjs 9/9（全新真实旅程一次通过：秒表→过稿开机→杀青 toast；另断点续拍复用上次失败 run 32s 杀青实证 retryRun 阶段保留语义）+ verify-v297.cjs 16/16（自包含化：夹具缺失自动零配额重建，定位精确到夹具项目不误触用户真实项目）+ v297 批次 4/4 + v298 17/17 + v293 12/12 + v295 16/16 + v296 全过 + serial-landing 全过 + seed-protocol 102/102 + approved-boot 13/13 + keepscript 6/6 + tsc/eslint src 零错误。
> - v2.9.8：外部出片入库闭环（E2E 代码审查双驱动：视频限额/占位模式下「贴片→合成→交付」是当下唯一真实出片路径，审查发现四条贴片路径全部不通——① 外链直接 PATCH：镜头格子变绿但 ffmpeg 只消费本地素材，合成必败且无指引；② 贴片弹窗「可留空仅标记完成」：合成判「未出片」，假完成态；③ 本地 /assets/ 地址：zod `.url()` 直接 422；④ 本地文件上传：通道不存在）——① **新端点 POST /api/clips/[id]/media**（v2.4.4 BGM 上传同构）：JSON {url} 服务端下载落盘（自包含纪律，与视频通道产物 persistVideoFile 同款语义；Content-Length 预检 + 80MB 上限 + MIME/扩展名白名单 + <1KB 异常拦截）或 multipart 本地文件直传，统一落 clip_{clipId}.{ext} → ffprobe 实测时长 → 短素材（<计划−500ms）自动对齐 plannedMs（防字幕/配音漂移；长于计划不受影响，-t 截取）→ 镜头标记 ready + 本地地址；旧入库文件换格式重贴自动清理。② **服务层护栏**：updateClip 拒绝 http(s) 外链直接作 mediaUrl（422 指引入库端点）；zod 契约同步放宽（/assets/ 本地路径合法）。③ **贴片弹窗重构**：双通道（直链下载入库 + 本地上传 mp4/mov/webm/mkv ≤80MB）+ 诚实忙态（下载入库中…/上传入库中…）+ 回车提交；「可留空仅标记完成」语义废除；成功播报含体积、时长对齐提示与全就绪指路（「打开成片页签即自动合成」——自动合成挂在成片面板，页签未挂载不触发，文案不再虚报）。④ **文案对齐**：noop 失败指引/成片面失败行/批次播报统一「贴片入库（直链自动下载/本地上传）」口径。合成器本就按画幅 scale+crop+fps 归一重编码——任意来源/规格素材皆可入片（底座未动）。验收：verify-v298.cjs 17/17（零生成配额：ffmpeg 合成 2s+5s 测试素材；直链下载入库（toast/plannedMs 2000 对齐/自包含落盘）+ 本地上传入库 + 全就绪自动合成 17s + 成片时长 7.5s=2.5 片头+2+5−转场重叠 + 双护栏 422/415 + 项目与素材清理）；回归 v293 12/12 + v295 16/16 + v296 全过 + serial-landing 全过 + seed-protocol 102/102 + v297 快速面 16/16（零配额夹具 fixture-pending-project.cjs 重建 15 镜场景）+ v297 批次面 4/4 + approved-boot 13/13 + tsc/eslint src 零错误 + 零 pageerror。
> - v2.9.7：端到端真实创作流过程反馈专项（E2E 实拍驱动：试笔→开机→流水线→一键渲染→任务链全链路真机走查，零视频配额；核心发现=「点击后长时间无过程无提醒」四源）——① **noop 视频任务假转圈根除（P0）**：视频提交节流（VIDEO_SUBMIT_INTERVAL_MS=12s，为真机通道 429 保护而设）此前通道无关，占位模式下 15 镜秒败任务被拖成 ~7 分钟队列爬行且每个还白烧一次重试——VideoProvider 接口新增 `remote` 能力声明（zai=true / noop=false），节流只作用于真机通道；noop 失败为确定性配置缺失，新 NonRetryableError 直落 failed 不回队（对齐 v2.4.3「占位任务秒级落败」验收语义）。实测 15 镜 4.4s 全部落定（修复前 ~7 分钟）、attempts 全=1、失败原因含贴片指引。② **运行终态播报（P0）**：杀青/中断此前完全静默（成功只切页签、失败连页签都不切）——activeRun running→终态迁移时 toast：杀青「全组杀青 · 制作包已就绪（去成片渲染出片）」/中断 destructive「剧组中断（原因 + 可断点续拍）」+ 自动切「剧组进程」页签；仅播报真实迁移，载入已终态项目不误报。③ **任务批次落定播报（P0）**：任务结果此前只静默躺在任务中心，单镜渲染失败后用户永远等不到回填——fetchTasks 检测「有活跃→全部落定」迁移，一批一报：成功「渲染任务完成 · N 项」/失败「本批渲染 N 项未成功」+ 占位指引（逐镜贴片/启用真机通道）+ 首条原因；取消不播报。④ **任务轮询断链自愈（P0）**：链式 setTimeout 轮询一次瞬时错误（网络抖动/dev 编译延迟）即永久断链、任务冻结在「进行中」无人观测——catch 分支在仍有活跃任务时强制续排。⑤ **断线重进自动恢复（P1）**：「断线重进可自动恢复观测」承诺此前是半真（服务端会恢复，但前端刷新即丢会话，需手动从项目库找回）——localStorage 恢复键（drama-workshop:last-project）在开机/保存/载入/续写时写入，页面挂载时自动恢复上次现场（运行观测/任务轮询随 loadProject 续接）+ 恢复 toast；项目已删则清键。⑥ **另起新片入口（P1）**：会话态下唯一新片路径是刷新页面的副作用，恢复键上线后该路径消失——顶栏新增「另起新片」（会话态可见）：closeSession 停双轮询器（修复 run 轮询持续写回已清空 activeRun 的泄漏）+ 清恢复键，项目留库可回；拍摄中另起时 toast 提示剧组后台继续拍。⑦ **通道模式共享探明（P1）**：/api/channel 探明结果上收 store（videoChannelReal，幂等 probe，页面挂载一次），成片面板/镜头轨单镜渲染共用（去双份 fetch）；占位模式下渲染中文案/tooltip/提交回执统一换贴片指引口径（「每镜约 60~90s」真机口径不再误导 noop 用户；「待处理」→「秒级落定 + 贴片指引」）。⑧ **试笔秒表（P2）**：真实推演 20~40s 仅有步骤轮播时无法区分「还在跑」与「卡死」——加载卡新增秒表行（编剧室推演中 + 已进行 Ns，store generatingSince 时间戳驱动）；开机指令下发期按钮文案「剧组拍摄中 …」→「全组开机中…」。⑨ **任务中心溢出计数（P2）**：tasks.slice(0,12) 静默截断 → 补「还有 N 个任务未展示（共 M）」。验收：verify-v297-journey.cjs 9/9（真实旅程：秒表递增/过稿开机承接/杀青 toast）+ verify-v297-batch.cjs 6/6（接管观测 6 任务在途→成功播报；单镜 noop 秒败→失败播报+占位指引+首条原因）+ verify-v297.cjs 快速面 18 断言（恢复链路/另起新片清键回空态/秒级落败计时/溢出计数）+ 回归 verify-v293 12/12 + verify-v295 16/16 + verify-v296 14/14 + verify-serial-landing 全过 + verify-seed-protocol 102/102 + tsc/eslint src 零错误 + 零 pageerror。
> - v2.9.6：新用户首屏转化深化 + 剧本过稿开机（VLM 产品总监视角 8 视图专项走查：空点开机 2 视 + 左列输入面 4 视 + 右列信任链 2 视；最高频缺口为「耗时/成本/兜底三问全空白」8/8 视图复现；转化漏斗第二环排查发现试笔→开机承接断裂）——① **空点开机指路（P0）**：空梗概点开机从「右上角报错 toast」升级为「指路 toast + 自动滚动定位并聚焦梗概输入框」（报错/按钮/输入框三点分离是新人第一试错点）。② **低风险试步显式化（P0）**：「仅快速推演场次剧本（不立项）」小字链接升级为「先试笔 · 只推演剧本（零视频额度）」描边按钮 + 差异说明行——新用户不再只剩「赌一把全量开机」或流失两条路。③ **开机须知（P0）**：主 CTA 下两行可兑现承诺（剧本分钟内出稿·成片逐镜渲染·进度可旁观 / 改角色场景只补拍受影响镜头·断点续跑不重烧）——不编造分钟数不虚报额度，全部为锚点系统与阶段幂等的真实能力。④ **双 CTA 文案统一（P1）**：左右两枚开机按钮主标同为「全组开机 · AI 剧组流水线」（5/8 视图指出文案不同读起来像两个不同动作）。⑤ **就绪信号（P1）**：梗概 ≥10 字时输入现场变绿「梗概就绪 · 可开机」。⑥ **示例成片因果链（P1）**：语境条升级「本片 = 左列「填充示例梗概」同款梗概 · 默认快拍机组实产 · 系列第 1 集」——已核实种子项目梗概与 shuangwen sampleSynopsis 逐字同源，输入→输出因果真实可兑现。⑦ **场记 duty 去循环定义（P2）**：「锚定组装 · 跨镜一致性 · 状态连续」→「逐镜登记锚点 · 跨镜接戏不穿帮」（接戏=连续性行话，专业语义不变）。⑧ **剧本过稿开机（P0，转化漏斗承接）**：排查发现试笔成功后唯一开机入口是折叠区里的红色破坏性「按新配置重新开机」+ 二次确认（没开过机何来「重新」，语义与情绪双错），且流水线编剧阶段无条件重写——「满意再开机」的承诺是虚的。修复三件：首次开机主 CTA（剧本在手且从未开机的会话，品牌渐变常驻折叠区外，无二次确认；重拍过/在制项目才保留红色重开）；keepScript 开机契约（POST /runs 增可选 keepScript，会话剧本与当前梗概/题材/编剧深度一致时沿用已过目剧本不重写——传统剧组纪律：剧本定稿开机不重拍编剧，已过目剧本随开机 PATCH 入库；输入已改则诚实提示「编剧室将按当前输入重写剧本」）；服务端 stageScreenwriting keep 分支（秒回沿用+场记日志留档，无剧本防御式回退）。验收：verify-v296.cjs 14/14（含行为验收：空点开机 toast 指路 + 自动聚焦输入框 + 填充示例后就绪信号）+ verify-approved-boot.cjs 11/11（E2E 网络契约：试笔→主 CTA 常驻/红钮清零、POST /runs keepScript=true、PATCH storyBeats 入库、载入草稿沿用态、改梗概翻转重写态、草稿零残留；POST /runs 与 GET /runs/* mock，零视频/图像配额）+ verify-keepscript-stage.mjs 6/6（服务端 keep 分支单测：秒回未触文本通道/剧本逐字节未动/日志留档）+ 回归 verify-v295 16/16 + verify-v293 12/12 + verify-serial-landing 7/7 + verify-seed-protocol 102/102 + VLM 视觉抽检 12 过 13 视口折叠伪影（E2E 契约证实在位）+ tsc 零错误 + 零 pageerror。
> - v2.9.5：连载生产线会话态表达（VLM 产品总监视角 16 视图全局走查驱动——空态动线 8 视 + 项目库 1 视 + 会话态 7 视；去伪存真后「连载在会话态不可见」8 视图复现为最大真缺口）——① **信息卡「系列连载」区块（P0）**：系列标题 + 剧集 chips（第 N 集 + 状态点：成片已合成 emerald / 制作中 amber，当前集高亮；点击其他集直接切会话，多集切换不绕道项目库）+ 跨页签「续写第 N 集 · 沿用角色定妆」入口；数据源 GET /api/series/[id]，SeriesEpisodeSummary 增 finalVideoUrl。② **续写弹窗提升会话层**：开合状态从成片面板本地态提升到 store（nextEpOpen），信息卡与交付区共用同一弹窗组件（next-episode-dialog.tsx）——续写不再只在成片页签可达。③ **上集留钩回顾条**：弹窗内摘录卡点留钩场（场名 + 画面 + 金句，无 cliffhanger 场回退末场）——续写「接得住」的上下文现场。④ **AI 接钩子写本集走向（P1）**：新端点 POST /api/projects/[id]/next-episode-synopsis（series-service.draftNextEpisodeSynopsis：编剧室按上集剧本 + 题材战术手册起草 80~150 字承接梗概，思考档跟随项目编剧深度，文本通道零视频配额）——填入框内可改，AI 只降门槛不代笔；实测草稿承接「旧账新算」钩子、延续人物冲突、结尾留新钩。⑤ **制作包清单常显（P1）**：成片交付区「制作包含：镜头素材 · 定妆图 · 分镜表 · 字幕 · 配音 · 工程档案」（4 视图复现「ZIP 里有什么不可见」）。⑥ **载入落点（P1）**：会话切到另一集且已合成时自动落「成片」页签——已完项目的终点是交付物；未合成项目不动页签。⑦ **拍摄配置「进阶微调」定位（P2）**：尾部补「拿不准就用默认机组直接开机，配置随时可改，不影响已生成内容」——消除必选项焦虑（剧组语言保留，v2.9.3 原则不动）。验收：verify-v295.cjs 16/16（含 AI 接钩子 API 合约：110 字草稿无 JSON 污染）+ 回归 verify-v293 12/12 + verify-serial-landing 全过 + verify-seed-protocol 102/102 + VLM 视觉抽检 4/4（系列区块/弹窗/清单行/提示行均过，P2 左对齐建议已采纳）+ tsc/eslint 零错误 + 零 pageerror。
> - v2.9.4：提示词语言纪律完备 + 落地页连载身份表达（「确定性映射」体系补全）——① **场记状态映射扩容**：STATE_NOTE_PROMPTS 22→31 键（淋雨/泪流满面/披头散发/醉酒/镣铐/昏迷/暴怒/狞笑/换常服近义高频词）；导出 STATE_NOTE_KEYS，导演拆镜提示词状态词单同源内插（单一来源，新增词零漏同步；「优先用+双层兜底」语义，表外词按原文保留不丢弃）。② **台词链路接口面收口**：VideoRenderRequest/PromptInput 移除无消费方的 subtitle 字段（5 处），台词永不进画面提示词（TTS 配音+字幕烧录链路各归其位），接口注释写明防误用。③ **动作段语言纪律注释**：visualPrompt 缺失回退中文 visualDesc 明确为降级路径（不引入 LLM 即时翻译，确定性纪律）。④ **种子数据协议同源（P0 数据纪律）**：finalPrompt 由真组装器 composeVideoPrompt 现算（与 run-service 同代码路径），promptVersion 落锚点指纹（历史版本填 "anchor-v2" 版本串为错误用法）；10 镜独立英文动作句（历史版本 10 镜共用同一句致动作段全镜失真）；状态注记「衣襟汤渍」自造词→词表词「衣冠不整」且挂对对象（泼汤泼在陈锋非晚秋）；refPlan 修正——前 4 镜补挂寿宴大厅（历史版本前 4 镜缺 [SCENE] 段一致性锚定失效）、镜 8「酒杯坠地」去错挂虎符；种子改 bun 运行（import TS 组装器）。⑤ **落地页连载身份表达**：示例成片徽标「示例 · 实产」→「示例实产 · 第 1 集」+ 语境条补「流水线实产系列第 1 集 / 可一键续写下一集」（EP.01 徽标背后的连载身份在转化现场说出来）。⑥ **种子协议验证固化**：内联验收固化为常备脚本 `verify-seed-protocol.mjs`（102 断言：同源复算逐字节一致/七段零中文/台词零入画/[Scene] 全勤/状态挂对对象/去错挂道具复核/framing 术语落地），重播种后可复跑。⑦ **旧晃动视频重渲染就绪（零生成准备）**：`rerender-manifest.mjs` 盘点/重锚/执行单三合一——按「提示词状态 × 成片年代」双轴分类（v2.8.2 摄影纪律截止 2026-11-12T04:50:42Z，早于它的成片 = 旧渲染），`--apply` 零配额重锚过期镜头，执行单（逐镜 curl，真实 clipId）落 `db/rerender-manifest.json`，绝不自动触发任何生成通道，待配额窗口人工执行。验收：verify-v293.cjs 12/12 + verify-serial-landing.cjs 6/6 + verify-seed-protocol.mjs 102/102 + 重渲染盘点 9 镜待重渲（镜 10 本就待出片）+ tsc src 零错误。
> - v2.9.3：模型参数用户语言化专项（产品原则：AI 剧组 ≠ 传统剧组，但必须保有传统专业性——底层是模型参数，创作语言是剧组语言）——① **单一映射源**：`drama.ts` 新增四个确定性映射函数（`videoModelCrewLabel`/`thinkingLevelCrewLabel`/`durationCrewLabel`/`resolutionCrewLabel`），与 SHOT_SIZE_PROMPTS「中文景别→英文电影术语」同款模式：底层 id 入库不变（历史项目/连载继承零迁移），仅展示层取词，未命中回退工程值。② **拍摄配置面板**（工作台第三步）：步骤名「模型配置」→「拍摄配置」；字段名剧组化（AI 视频基模→拍摄机组、剧本思考深度→编剧室深度、分辨率→成片规格）；下拉项全部剧组语言主词 + 工程值小注（快拍机组 · Flash（单镜 5s · 720p）/ 初稿直拍（low · 快出爆点）/ 3 秒 · 快切 / 1080p · 高清母版）——「不完全一样」的 AI 特性仍诚实可见。③ **提示词增强→导演讲戏**：开关改名 + 副标说明补写内容（英文电影级镜头语言：运镜/光影/质感）。④ **工程信息卡**：值一律走映射（拍摄机组/单镜规格/编剧深度/导演讲戏），不再向创作者泄漏裸工程值（low/medium/high/Omni 1.2 Flash）。⑤ **导出 Markdown**：元信息行同步剧组语言（拍摄机组：主力机组 · Pro · 单镜 8 秒 · 长镜头 · 成片 1080p · 高清母版）。⑥ LLM 系统提示词内的参数段保持工程语义（给模型看的用机器语言，给人看的用剧组语言——各归其位）。验收：`verify-v293.cjs` 12/12 断言（面板字段/4 下拉剧组语言选项/信息卡映射值/零裸工程值泄漏）+ tsc src 零错误 + 零 pageerror。
> - v2.9.2：信任面与交付可达性专项（VLM 产品总监视角 11 视图全局走查驱动）——① **成片封面帧体系（P0）**：成片首帧是暗场片头卡，浏览器渲染黑屏首帧，三轮走查均误判「黑箱播放器/无真实内容」；compose-service 合成后自动抽 25% 时长处高燃帧（810 宽）落约定路径 `final_{id}_poster.jpg`（不落库不迁移，404 自动回退黑帧），落地页与工作台播放器统一引用；演示成片 poster 由 VLM 从 7 候选帧选定。② **落地页可干预性声明（P0）**：7/11 视图高频缺口「开机=黑箱不敢用于生产」——五阶段导览下新增声明条（产出留档可改 / 锚点改动自动标受影响镜头 / 断点续跑），把真实兜底能力说给用户。③ **项目库交付中枢（P0）**：ProjectSummary 增 finalVideoUrl，项目卡对已合成项目直接给「成片」「制作包」下载入口（stopPropagation 不误触载入）——库不只服务「进入再生产」，也服务「取回已产出」。④ **资产页成片入口条（P1）**：与节奏页同语言，主交付物从任意页签可达。⑤ **节奏页分析→行动闭环（P1）**：达标清单 Meter 组件增 action 槽，未达标项渲染「去 AI 拆解分镜 / 去分镜表切换景别/运镜 / 去剧本改台词」直达按钮。⑥ **种子数据运镜协议规范化（P0 数据纪律）**：seed 自造驼峰运镜名（slowPushIn/craneDown/orbitRight…）不在 CAMERA_MOVEMENTS 池内，节奏页运镜多样性把 8 种算成 1 种——演示数据与真实流水线同协议（语义保真重映射 8 种规范机位）；种子直接建为系列第 1 集（历史版本重播种后连载身份丢失）。⑦ **回归基础设施**：ui-verify-series 断言动态化 + 自清理（旧版写死「第 3 集」且每次运行净增 1 个空壳集污染演示库）；项目库载入成功自动收起抽屉（与续写创建同语言）。⑧ 仓库入口补建（README.md + package.json 产品身份对齐 drama-workshop@2.9.2）。
> - v2.9.1：示例成片视听完整性专项（全局产品走查驱动：11 张用户旅程实拍逐视图审）——① **片头卡排版修复（P0）**：剧名 fit-to-width（单行放不下等比缩 → 跌破下限且含「·」拆两行 → 病态超长截断兜底），装饰线宽度跟随标题，删除 ASS 白字覆叠层（历史双重绘制 + WrapStyle:2 溢出，实拍片头「双层标题打架、双双出框」）；排版决策抽纯函数 `layout_card_title` + `scripts/test-draw-card.py` 8 断言全绿；示例成片已重合成回填（本地 ffmpeg 零配额）。② **示例成片配音链路真实化（P0）**：全局走查发现种子演示项目字幕轨/配音轨零数据 → 成片是无声哑片（信任实据第一眼即硬伤）——TTS 重录三幕台词（女声羞辱句 + 男声清算句，ASR 回验逐字一致），`voice_demo_*.wav` 提交 + seed/patch 镜像 dispatcher 回写协议（voice_{clipId}.wav + voiceover 轨 style.url）；台词分布纪律化（每幕至多一句有声台词落叙事拍点，修复 i%3 机械分配导致的同句重复；大特写静默处理）。③ **合成算力档校准（P1）**：2 核 9 镜 1080p 实测 ~10 分钟，`COMPOSE_TIMEOUT_MS` 默认 4→10 分钟；`--x264-preset` 参数化（`COMPOSE_X264_PRESET`，全部编码阶段统一消费，零硬编码纪律）。④ **交付语义补层（P1）**：成片页签「已合成」与「N/N 镜就绪」并存时补口径说明行（未就绪镜头未计入，补拍后重新合成即可入片）。⑤ **版本口径收口（P1）**：`APP_VERSION` 单一出处（tokens.ts），顶栏徽标不再硬编码（v2.8.0 漂移修复）。⑥ **交付面清理**：孤儿成片/中间 .ass 产物出库（git rm + ignore），落地页示例成片指向重制版并去 muted（点播即闻）。详见 §7.9。
> - v2.9.0：产品交付面专项（全局产品走查驱动，VLM 产品总监视角审 5 视图）——① 连载生产线产品化：系列 API（v2.3）后端就绪但前端零调用的战略缺口修复，「续写下一集」一键动线（成片页签交付区 CTA + 项目库系列分组直发 + Dialog 承接梗概）；独立项目自动 adopt 为系列第 1 集（`adoptProjectAsSeriesEpisode1`，系列名取标题前缀，幂等）；`POST /api/projects/[id]/next-episode` 一键端点（题材/模型参数继承上一集，资产库默认克隆——同一角色跨集同一张脸）；会话携带系列归属，信息卡连载徽标；首页亮点改用户价值语言（去 ffmpeg 术语，新增「系列连载 · 一键续集」「制作包一键下载」）。② 制作包一键交付：零依赖 ZIP（node:zlib deflateRaw + 手写 central directory/CRC32，不引第三方库）；`GET /api/projects/[id]/package` 打包 01_成片 / 02_镜头素材 / 03_定妆图 / 04_配音 / 05_文档（分镜表.md + 字幕.srt）/ 06_工程档案.json；产物文件只读 public/assets 白名单路径缺文件优雅跳过；成片页签「下载制作包 ZIP」；中文文件名 RFC 5987。③ 成片全局可达：节奏轨道页顶部「本集成片已就绪 · 去成片」入口条（VLM 产品走查 P0：节奏页全是分析数据，主交付物不可见）。④ 落地页信任实据：手机 mockup 从静态占位升级为可直接播放的示例成片（流水线实产 MP4，点击即播）——把「产品承诺」变成「可验证的演示」。详见 §7.14。
> - v2.6.0：AI 剧组流水线交互专项 + 色彩纪律全局收口（VLM 三轮复审，题材选中态图 6.5→7.0）：新增会话态常驻「五阶段流水线导轨」（`pipeline-rail.tsx`，状态图标/品牌色连接线/点击直达产物页签/已完成阶段产物计数，与剧组进程阶段卡同源 `stageArtifact` 禁止口径漂移）；题材色彩体系退役——删除 GenrePreset 的 gradient/ring/text 八套色卡与 CREW_ROLES 六岗位色字段（零消费点却诱导深件误用，P0 白屏事故源头），选中态降级为 amber 描边浅底（全页最大彩色面积让渡主 CTA），全站唯一品牌渐变收口为 `BRAND_GRADIENT` 常量（logo/主 CTA/题材徽标/下载成片）；产物计数文案去重（「锚定组装 10/10」而非「10/10 锚定」）；操作语义色修正（下载成片 emerald→品牌渐变实底、保存锚点 emerald 渐变→amber 实底、BGM 上传降中性、已合入说明文字回归中性）；就绪说明独立成行、日志角色词 chip 定宽成列、toast 右下→右上（避开底部操作区）、REC 呼吸点→静态 PREVIEW（录制态语义留给真实运行）、EN 影调锚点折叠为高级区、参数栅格 2×3 收口、「制作中/成片已合成」徽标互斥、页签激活态加粗。
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
| 1 | 剧本创作 | 编剧 | 确认/改写场次剧本 | TextProvider 场次化推演（v2.7：3~6 场弹性，首场 hook、末场 cliffhanger） |
| 2 | 选角定妆 | 选角定妆 | 过目定妆图、微调外观描述 | 资产提取 + ImageProvider 定妆 |
| 3 | 导演拆镜 | 导演 | 浏览分镜、拖拽修正 | 场次级拆镜（含能量值/音效标注） |
| 4 | 锚定组装 | 场记 | 无需参与（自动） | prompt-engine 确定性组装 + 锚点指纹 |
| 5 | 后期成包 | 后期 | 验收制作包（定妆图/字幕/音效/配乐/曲线） | 三轨落轨 + 能量曲线聚合 + 缺图资产自动提交定妆任务（幂等去重） |

> **口径声明（五阶段 vs 六行，勿混淆）**：本表是**产品叙事六步**——第 0 步「制片立项」是
> 用户在落地页的一次交互动作（选题材/梗概/参数 + 点开机），**不属于 ProductionRun 编排**。
> 代码与 UI 的唯一阶段真相源是 `RUN_STAGES`（drama.ts）= **开机后 AI 自动执行的五阶段**
> （01 剧本创作 → 05 后期成包），首页标题、流水线导轨、剧组进程面板一律按五阶段渲染。
> 禁止把「制片立项」写进 RUN_STAGES 或任何阶段进度 UI（会让 run 状态机出现永不
> running 的假阶段）；叙事场合需要完整剧组隐喻时使用本表六步并注明第 0 步为用户动作。

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
        ├── StoryBeat × 3~6（场次，含 narrativeFunction 5 类与 energyStart/energyEnd）
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
│  /              工作台首页（题材 → 梗概 → 生成场次剧本 → 拆镜 → 镜头轨）                 │
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

**运镜执行规范（v2.8.2 · 摄影组专业纪律）**：要排除的是「意外抖动」，不是「有意图的运镜」。手持、甩镜、荷兰倾斜是正当的电影技法（专业语义保留），但 AI 视频基模分不清「风格化运动」与「低质量抖动」，因此运镜 prompt 必须写明三要素——运动语义 + 执行设备 + 受控度：
1. 每个机位声明执行设备或受控限定：推拉走轨道（dolly）、升降/俯拍用摇臂（crane/jib）、环绕用稳定器（steadicam/gimbal）、固定/横摇用三脚架（locked-off tripod）；手持 = controlled handheld（受控手持、幅度 subtle）、甩镜 = precise whip pan（单条完成、受控运动模糊）；
2. 运镜池首位（`pool[0]`，LLM 给错时的回退默认位）必须是通用设备执行机位（push/pull），风格化机位（手持/甩镜）保留在池中后位，服务于 buildup 等需要临场感的场次；
3. 技术段尾缀（`PROMPT_TECHNICAL_TAIL`）全局注入 `intentional camera movement, steady controlled framing`——用电影摄影行话区分「有意图的调度」与「意外抖动」，且不与风格化机位打架；
4. 剧本与拆镜两处 LLM 提示词带「运镜执行规范」硬约束，并遵守 180° 轴线规则（正反打不得跳轴）；
5. 景别（SHOT_SIZES 中文行话）经 `SHOT_SIZE_PROMPTS` 确定性映射为英文电影术语（extreme long shot / close-up / extreme close-up…）后才进提示词——中文景别直拼英文 prompt 基模无法消费。

**各部门专业纪律（v2.8.3 · 全部门审计）**：按真实剧组分工逐部门对齐专业标准——
1. **场记（状态连续性闭环）**：拆镜 LLM 按场记单职责输出 `characterStates`（角色名→状态词，如「陈锋」→「负伤」），绑定引用时写入 `ShotRef.stateNote`；锚定组装时经 `STATE_NOTE_PROMPTS` 确定性译为英文（wounded / blood-stained / changed into military uniform…）注入提示词——服化道/伤效的跨镜头状态连续性由数据闭环保证，不再依赖模型记忆；
2. **灯光/美术（时段光效连续性）**：编剧 description 必须写明场次时段与内外景（「夜·内 宴会厅」）→ 选角阶段场景 visualAnchor 必须含时段与主光源（at night, warm chandelier glow, interior）→ 拆镜规则约束镜头光效与本场时段及光源方向一致、同场不得日夜跳变——三级联动消灭同场镜头光效穿帮；
3. **摄影（景深随景别）**：景深随景别走是摄影铁律——`SHOT_SIZE_PROMPTS` 每档景别同时携带 framing 与 depth（特写=shallow depth of field、中景=medium、全景/远景=deep focus），确定性注入技术段；
4. **剪辑（动接动）**：拆镜规则要求剪点优先落在动作进行中（伸手/转身/掷物瞬间），避免静态跳切堆叠；对话正反打遵守 180° 轴线；
5. **录音（轨道定位诚实化）**：成片混音 = 配音轨 + BGM（EBU R128 响度归一 + 对白侧链闪避）；音效轨（sfxHint 拟音提示）定位为随制作包交付、由后期拟音执行——与现实剧组拟音师分工一致，阶段报告如实区分「成片烧录/混音」与「制作包交付」。

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
     + 调色 `--grade-filter`（v2.5）+ 编码预设 `--x264-preset`（v2.9.1，默认 medium，弱算力可配 veryfast 换速度，
     全部编码阶段统一消费）；
   - **片头卡排版纪律（v2.9.1）**：剧名 fit-to-width——单行放不下等比缩，跌破下限且含「·」拆两行，
     病态超长截断兜底；装饰线宽度跟随标题实际宽度；ASS 不再叠加同名白字（单一渲染源，
     消除历史「双层标题打架 + 双双溢出」缺陷）；排版决策为纯函数 `layout_card_title`（scripts/test-draw-card.py 断言）；
   - **算力档（v2.9.1 实测校准）**：2 核机器 9 镜 1080p 整集约 10~12 分钟，`COMPOSE_TIMEOUT_MS`
     默认 4 分钟 → 10 分钟；`COMPOSE_X264_PRESET` 默认 medium；
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
- compose 同步执行（ffmpeg 分钟级：中间段转场编码 + 末级重编码 + 响度归一；1080p×9 镜在 2 核约 10 分钟），请求方需等待；超时/失败返回可读错误，不写入 finalVideoUrl；
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

**v2.6 补则（流水线交互专项 + 色彩纪律全局收口沉淀）**：

- **唯一品牌渐变的适用清单**：`BRAND_GRADIENT`（drama.ts 导出常量）仅用于
  logo / 全组开机与一键渲染类主 CTA / 题材徽标 / 下载成片终点操作；
  **题材选中态不得使用大面积渐变**（降级为 amber 描边 + 浅底，
  全页最大彩色面积必须让渡给唯一转化点），GenrePreset 不再持有任何配色字段；
- **操作语义色铁律**：绿色（emerald）仅限状态徽标与成功图标，
  禁止承载任何操作按钮（下载/保存/上传一律品牌渐变、amber 实底或中性描边）；
  危险操作 = 红描边 + 二次确认（v2.5.2 三件套）；amber 实底 = 保存类主 CTA 专属；
- **产物计数单一真相源**：阶段产物计数统一取 `stageArtifact(stageKey, session)`
  （pipeline-rail.tsx 导出），导轨与剧组进程阶段卡禁止两处口径漂移；
  计数文案不与阶段名同位重复（「锚定组装」展示「10/10」而非「10/10 锚定」）；
- **导轨即导航**：会话态五阶段导轨是常驻生产进度导航（pending 灰点/running
  amber/succeeded emerald/failed rose），点击直达该阶段产物页签，
  运行中阶段点击 → 剧组进程看实时日志——「进度」与「导航」二合一，
  不另设纯装饰性进度条；
- **闲置语义防呆**：mockup 预览不得使用 REC 等运行态暗示（静态 PREVIEW）；
  空日志容器必须有占位文案（防呆不空白）；toast 避开底部操作区（右上角）。

### 7.14 产品交付面：连载生产线与制作包（v2.9）

**设计动机**：全局产品走查（VLM 产品总监视角）定位的两个战略级缺口——
连载是这个品类的留存引擎（日更/周更），制作包是工作室二次加工/投流的
刚需交付物；两者此前「后端就绪、产品不可见」。本节为产品交付面立规。

**连载动线（一键续写）**：

- **adopt 语义**：独立项目不要求用户预先理解「系列」概念——首次续写时
  自动升级为系列第 1 集（`adoptProjectAsSeriesEpisode1`，系列名取项目
  标题前缀「X · 第 N 集」→「X」，题材快照继承，幂等：已属系列则沿用）；
- **继承铁律**：题材与模型参数缺省继承上一集；资产库默认克隆
  （`cloneAssets` 默认 true）——**同一角色跨集同一张脸是连载的生命线**，
  定妆图地址直接引用不重生成（§7.5 资产克隆机制）；
- **梗概必填**：新集梗概 ≥10 字由用户承接（AI 不越权代写剧情走向），
  Dialog 内说明继承规则，用户只做「剧情决策」；
- **入口分布**：成片页签交付区 CTA（成片交付不是终点）+ 项目库系列
  分组头部直发；新集创建后自动切会话（左栏同步题材/参数），
  toast 报告继承元数据（第 N 集 · 已继承 M 项资产定妆）；
- **契约**：`POST /api/projects/[id]/next-episode`
  `{ synopsis, title?, cloneAssets? }` → 新集全量详情 + 继承元数据；
  `POST /api/series/[id]/episodes` 保留（系列入口，v2.3 契约不变）。

**制作包（一键交付）**：

- **包结构契约**（目录前缀保序，交付物在前）：
  `01_成片/`（finalVideoUrl）· `02_镜头素材/`（就绪镜头 mediaUrl，
  二次剪辑用）· `03_定妆图/`（类型_名称）· `04_配音/`（voiceover 轨）
  · `05_文档/分镜表.md`（场次 × 镜号 × 景别 × 运镜 × 台词 × 能量 ×
  计划时长表格 + 每镜英文画面提示词）+ `05_文档/字幕.srt`（subtitle 轨
  通用格式，剪映/PR 可直接导入）· `06_工程档案.json`（v1.2.0 兼容全量导出）；
- **零依赖 ZIP**：node:zlib deflateRaw + 手写 local header / central
  directory / CRC32——不引入第三方压缩库（§3 原则 3 可插拔边界）；
- **安全边界**：产物文件只读 `public/assets/` 白名单前缀路径，URL 禁
  `..` 穿越；缺文件优雅跳过不炸包（制作包反映真实存在的产物）；
- **响应契约**：`GET /api/projects/[id]/package` 二进制 zip 响应
  （不走 ok/fail 封套）；中文文件名 RFC 5987（`filename*`）编码；
  无任何产物时 422 引导先开机生产。

**成片可达性原则**：所有分析类页签（节奏轨道等）都是给成片做注脚的——
成片就绪后必须在当前视图一眼可达（入口条直达成片页签），不允许
「分析数据满屏、主交付物不可见」的倒挂。

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
| POST `/api/projects/[id]/next-episode` | 一键续写下一集：独立项目自动 adopt 为系列第 1 集；题材/参数继承、资产克隆；返回新集详情+继承元数据（§7.14） | **新增 v2.9** |
| GET `/api/projects/[id]/package` | 一键下载制作包 ZIP（成片/镜头素材/定妆图/配音/分镜表.md/字幕.srt/工程档案.json；二进制响应，RFC 5987 文件名） | **新增 v2.9** |

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

### v2.6.0 —— AI 剧组流水线交互专项 + 色彩纪律全局收口 ✅ 已实施
（VLM 三轮复审驱动：题材选中态视图 6.5→7.0，操作语义色/层级问题清单逐轮收敛）
1. **五阶段流水线导轨（核心增量，`pipeline-rail.tsx`）**：会话态页签上方常驻紧凑导轨——01-05 编号 + 状态图标（pending 灰点/running amber 旋转/succeeded emerald 勾/failed rose 叉）+ 品牌色连接线（已完成段填充）+ 已完成阶段产物计数（3 幕/5 资产/10 镜/10/10/成片可下载）；**点击直达产物页签**（编剧/导演/锚定→分镜剧本，选角→资产定妆，后期→成片），运行中阶段点击→剧组进程看日志；宽度收紧（计数 9px/连接线收窄）保证 1728 视口五阶段完整可见不横向截断；
2. **题材色彩体系退役**：删除 GenrePreset 的 gradient/ring/text 8 套色卡（马甲大佬 violet/fuchsia、悬疑反转 teal/emerald 等渲染路径上的越界色源头）与 CREW_ROLES 六岗位 color 字段（零消费点、诱导组件误用即 P0 白屏事故源头）；题材选中态 = amber 描边 + 浅底 + amber 图标（VLM 复审：大面积渐变抢主 CTA 注意力）；全站渐变收口为 `BRAND_GRADIENT` 常量（题材徽标/选中态 CTAs 同源）；
3. **操作语义色修正**：下载成片 MP4 从 emerald 描边升级为品牌渐变实底（全链路终点主操作）；保存锚点 emerald 渐变→amber 实底（与保存到项目库同语言）；「已合入成片」说明文字回归中性（绿色仅留 BadgeCheck 图标）；BGM 上传降中性描边 + 「未设置」徽标化；任务类型图标统一中性（颜色只区分状态不区分类型）；
4. **防呆与降噪**：REC 呼吸点→静态 PREVIEW（录制态语义只留给真实运行）；空日志容器占位「剧组动员中…」；toast 右下→右上（VLM P0：遮挡成片下载操作区）；EN 影调锚点折叠为「高级」区（压缩左栏垂直空间）；「制片→编剧→…」文字链删除（与阶段卡重复）；日志角色词 chip 定宽成列；参数栅格 7→6 格收口 2×3（分镜幕数+镜头片段合并为分镜规模）；「制作中」与「成片已合成」徽标互斥；页签激活态加粗；底部状态条去内部术语。
**验收**：tsc/eslint src/ 零错误；next build 成功；`scripts/runtime-verify-v26.cjs` 8/8 断言通过（导轨渲染/产物计数/点击导航两向/阶段卡同源计数/马甲大佬 amber 选中态/DOM 零 violet-fuchsia-purple/零 pageerror）；VLM 三轮复审题材视图 6.5→7.0 且 P0 问题清零（余下为结构权衡类建议，见遗留）；零外部通道调用（VLM 仅图片理解）。
**遗留（v2.7 候选）**：无会话态右侧预览区与左栏密度平衡（预览区压缩/分镜缩略条填充）；成片页签预览与操作链的首屏权重重排（下载链上提）；五阶段导览卡在无会话态的「配置完成度」状态化。

### v2.9.10 —— 异步动作反馈完备性与环境韧性 ✅ 已实施
（代码审计驱动：26 个用户可点击异步动作全量扫描「过程反馈三件套」（在途态/完成提醒/失败提醒）——14 个完备、8 个缺口、4 个可疑；缺口集中在四类残存来源：批量提交无在途、失败恢复入口静默、不可逆动作无确认、误导性成功提示。回归期另发现合成服务对 Python 解释器的 PATH 解析在沙箱环境回收后失稳）
1. **一键渲染全片在途态（P0）**：`POST /render-all` 批量建 N 视频 + N 配音任务，慢网下数秒无任何反馈且可连点重复提交——store 新增 `renderingAll`（在途标记 + 防重入 guard），成片面按钮在途转圈/禁用/文案「正在提交渲染任务…」，落定后既有成败 toast 接力；
2. **任务中心重试/取消失败播报（P1）**：官方指定的失败恢复入口（noop 失败指引「可在任务中心逐项重试」）catch 静默吞错——重试/取消失败时用户「点了没反应」。修复：`retryTask`/`cancelTask` 返回错误信息（catch 不再吞），行内图标按任务粒度在途转圈（`taskActionBusy`）+ 禁用，失败 destructive toast（「重试未成功/取消未成功」+ 原因）；防连点双 guard；
3. **断点续拍在途态（P1）**：run 失败后用户情绪最急的时刻，续拍按钮无禁用可连点双发 retry——store 新增 `retryingPipeline` + 防重入，按钮在途「续拍启动中…」+ 转圈；
4. **项目删除二次确认（P1，§7.13 危险操作纪律补全）**：删除整集工程（剧本/分镜/资产定妆/成片素材）不可逆，却无任何确认（对比：「重新开机」有 AlertDialog）——补 AlertDialog（红色顶边 + 「将永久删除…不可撤销」+ 「另起新片」替代路径提示）+ 在途态（删除中… + 落定后关闭弹窗）；载入卡片补防重入（慢网连点不并发拉取）、重命名保存补在途态；
5. **行内小动作在途态（P2）**：分镜表上移/下移/重置/删除（`rowBusy` 按镜粒度）、场次卡「加入镜头轨」（连点会重复追加片段）统一补禁用 + 转圈；
6. **运镜切换诚实播报（P2）**：场次运镜切换本地乐观更新后 fire-and-forget 同步 PATCH，却立即弹「运镜已切换」——同步失败时是误导性成功提示。修复：`setBeatMovement` 返回入库同步结果，toast 按真实结果播报（成功=机位说明；失败=「本地已切换，但同步项目库失败——可稍后手动保存覆盖」诚实口径，自愈设计不变）；
7. **可疑项收口（P2）**：合成错误行内「重试」从「仅清错误依赖自动合成 effect 重触发」（allReady 条件不成立时点了毫无反应）改为显式调 `handleCompose`（在途「合成中…」）；BGM 更换/清除按钮补与上传同款在途转圈（一致性）；两处「重写并开机」AlertDialog（首页 + 剧组进程）点后立即关闭、反馈依赖视口外的左栏 CTA（1~2s 无反馈空档）——改为弹窗内等开机指令落定（preventDefault + finally 关闭），在途「开机中…」+ 转圈 + 取消按钮同步禁用；
8. **合成 Python 解释器解析（环境韧性）**：`assemble-episode.py` 的 draw_card 依赖 PIL；dev server 子进程的 PATH 解析可能落在无 PIL 的系统 python 上（实测：沙箱回收后 venv 重建差异，合成 500「ModuleNotFoundError: No module named 'PIL'」——shell 里 python3 有 PIL 而 server 子进程解析到另一个）。修复：`resolvePython()` 三级解析（`DRAMA_PYTHON` 显式覆写 > `~/.venv/bin/python3`（存在即用，预装 PIL/numpy）> PATH `python3`），进程内解析一次即缓存；其他部署环境不受影响（venv 不存在则回退 PATH）。
**验收**：`verify-v2910.mjs` 19/19（全新专项，零外部配额：Playwright route mock 延迟注入测在途态 + Prisma 直写构造 failed run / failed / queued 任务；覆盖重试失败播报含原因、取消失败播报、续拍在途+禁用+落定 toast、一键渲染在途+禁用+防重入+落定 toast、删除确认弹窗/取消保留/确认删除/卡片消失；测试过程中发现并顺带验证一个产品正确行为——mock 返回 running 后真实轮询翻回 failed 会触发 v2.9.7 的「中断自动切剧组进程页签」，测试需等该迁移落定再切页签）；全量回归 14 脚本全绿：v293 12/12 + v295 16/16 + v296 14/14 + v297 16/16 + v297 批次 4/4 + **v298 17/17（合成解释器修复后复跑通过——修复前同脚本 14/16，合成 500 根因即第 8 条）** + approved-boot 13/13 + serial-landing 全过 + seed-protocol 102/102 + delete-cascade 10/10 + json-repair 16/16 + tsc src 零错误 + 零 pageerror。

### v2.9.6 —— 新用户首屏转化深化 ✅ 已实施
（VLM 产品总监视角 8 视图专项走查：新用户从落地到「敢按下全组开机」的转化路径；最高频缺口「耗时/成本/兜底三问全空白」8/8 视图复现，「报错不指路」「双 CTA 像两个动作」「低风险试步被埋成小字」次之；去伪存真——VLM 报的错字「不立功/时光源锁定/流媒休」均为小字 OCR 噪声，代码核实无误，但「立项」一词对新人确实不自明，顺势改写）
1. **空点开机指路（P0）**：新用户第一试错点就是空着梗概直接点开机，历史行为是右上角 toast 报错（报错位置/按钮/输入框三点分离，新人不知道去哪填）——现在 toast 文案改指路（「已定位到左侧梗概输入框——写 10 字以上，或点「填充示例梗概」一键体验」）+ `guideToSynopsis()` 自动滚动定位并聚焦梗概输入框（`synopsis-input`）；两条开机入口（左主 CTA / 右导览 CTA）同走此路径；
2. **低风险试步显式化（P0）**：「只想先试试剧本？仅快速推演场次剧本（不立项）」小字链接 → 「先试笔 · 只推演剧本（零视频额度）」描边按钮 + 差异说明行（「AI 编剧先出三幕场次剧本给你过目，满意再全组开机——不立项、不消耗视频额度」）——转化漏斗上的中间档（先看笔力再决定开机），新用户不再只剩「赌一把全量开机」或流失两条路；
3. **开机须知（P0）**：主 CTA 下两行可兑现承诺（Clock：「开机后剧本分钟内出稿，成片逐镜渲染，进度在「剧组进程」实时可旁观」/ ShieldCheck：「改角色/场景只补拍受影响镜头；中断断点续跑，已完成阶段不重烧」）——全部为锚点系统与阶段幂等的真实能力，不编造具体分钟数、不虚报额度（种子任务时间戳为秒建假数据，不能光当耗时依据）；
4. **双 CTA 文案统一（P1）**：右列导览 CTA「全组开机 · 让 AI 剧组接管 01~05」→「全组开机 · AI 剧组流水线」，与左列主 CTA 主标完全一致（5/8 视图指出两枚开机按钮文案不同读起来像两个不同动作）；阶段衔接语义由上方「全组开机后 AI 自动执行」徽标与五阶段卡承担，无信息损失；
5. **就绪信号（P1）**：梗概 trim ≥10 字（与开机校验同源阈值 `SYNOPSIS_MIN`）时，字数计数器变绿「梗概就绪 · 可开机」——填完梗概「现在能不能开机」的即时回答放在输入现场；
6. **示例成片因果链（P1）**：语境条「示例成片可直接播放 · 流水线实产系列第 1 集」→「本片 = 左列「填充示例梗概」同款梗概 · 默认快拍机组实产 · 系列第 1 集」——已核实种子项目梗概与 shuangwen sampleSynopsis 逐字同源、机型即默认快拍机组，用户点填充→开机→同款成片的因果链完全真实可兑现（把「产品承诺」变成「可复现的演示」）；
7. **场记 duty 去循环定义（P2）**：「锚定组装 · 跨镜一致性 · 状态连续」是用阶段名解释阶段名（新人读到的第 04 阶段是黑话循环）→「逐镜登记锚点 · 跨镜接戏不穿帮」——接戏/穿帮是场记连续性职责的行话，专业语义不变，只把职责说成人话；
8. **剧本过稿开机（P0，转化漏斗承接）**：试笔成功后的会话（剧本在手、从未开机）此前唯一开机入口是折叠区内的红色破坏性「按新配置重新开机」+ AlertDialog——没开过机何来「重新」，且编剧阶段无条件 LLM 重写，「先试笔 · 满意再开机」的承诺是虚的。三件修复：①首次开机主 CTA（品牌渐变、折叠区外常驻、无二次确认；输入已改时翻转为「AI 剧组流水线」+ 诚实提示重写；重拍过/在制项目才保留红色重开）②keepScript 契约（POST /api/projects/[id]/runs 可选 body.keepScript；store 实时比对会话剧本↔当前梗概/题材/编剧深度，一致则沿用并 PATCH 已过目剧本入库；机组/时长/规格不影响剧本可放心改）③服务端 stageScreenwriting keep 分支（秒回「沿用已过稿剧本」+ 场记日志留档；无剧本防御式回退不炸）。传统剧组纪律：剧本定稿开机不重拍编剧。
**验收**：`verify-v296.cjs` 14/14（试笔按钮/差异说明/开机须知两行/双 CTA 统一含旧文案清零/因果链/场记 duty 新旧/绿条回归 + 行为验收三断言：空点开机出指路 toast、自动聚焦 `synopsis-input`、填充示例后「梗概就绪 · 可开机」且字数计数让位）；`verify-approved-boot.cjs` 11/11（E2E：真实试笔→主 CTA 常驻/红钮清零/开机不重写承诺；mock POST /runs 捕获 keepScript=true + PATCH storyBeats 入库；重载载入草稿→沿用态；改梗概→翻转重写态 + keepScript=false；草稿删除零残留——mock 仅 POST /runs 与 GET /runs/*，试笔/立项/PATCH 走真实本地接口，零视频/图像配额）；`verify-keepscript-stage.mjs` 6/6（服务端单测：keep 分支秒回未触文本通道/剧本逐字节未动/日志留档）；回归 verify-v295 16/16 + verify-v293 12/12 + verify-serial-landing 7/7 + verify-seed-protocol 102/102；VLM 视觉抽检：12-trial-firstboot 过（CTA 常驻醒目/无破坏性干扰/承接闭环成立），13-trial-flip 为视口折叠伪影（展开表单时 CTA 在折叠线下方，E2E innerText 契约证实翻转文案在位）；tsc 零错误；零 pageerror；外部通道仅试笔一次文本调用（E2E 验收）。

### v2.9.8 —— 外部出片入库闭环 ✅ 已实施
（E2E + 代码审查双驱动：视频限额/占位模式下「贴片→合成→交付」是当下唯一真实出片路径；审查发现四条贴片路径全部不通——外链直 PATCH 格子变绿但合成必败、留空标记完成被判「未出片」的假完成态、本地 /assets/ 地址被 zod `.url()` 拒绝、本地文件上传通道不存在——占位指引让用户去贴片，贴片本身却是断头路）
1. **新端点 `POST /api/clips/[id]/media`（P0，与 v2.4.4 BGM 上传同构）**：两种入参统一到一个出片语义——JSON `{url}`（http(s) 直链：服务端下载落盘，自包含纪律与视频通道产物 `persistVideoFile` 同款——合成不依赖外链，不受过期影响；Content-Length 预检 + 80MB 上限 + MIME/扩展名白名单 + <1KB 异常拦截 + 404/非视频 Content-Type 的可读原因）或 multipart `file`（本地文件直传：mp4/mov/webm/mkv ≤80MB）。统一动作：清旧入库文件 → 落 `public/assets/clip_{clipId}.{ext}` → **ffprobe 实测时长 → 短素材（< 计划 −500ms）自动对齐 plannedMs**（合成按 plannedMs 截取与排字幕/配音轨，素材短于计划会让后续镜头音画整体漂移；长于计划不受影响，-t 截取）→ 镜头标记 ready + 本地地址。响应含 sizeBytes / mediaDurationMs / durationAligned 供前端播报；
2. **服务层护栏（P0）**：`updateClip` 拒绝 http(s) 外链直接作 mediaUrl（422 + 指引入库端点——防「绿格子合成必败」的假完成态从 API 侧漏入）；zod 契约同步放宽（`/assets/` 本地路径合法，此前 `.url()` 只收绝对地址反把正确路径拒之门外）；
3. **贴片弹窗重构（P0）**：单输入框 +「可留空，仅标记完成」→ 双通道（直链「下载入库」+「上传本地文件」，回车可提交）+ 诚实忙态（下载入库中…/上传入库中…，v2.9.7 过程反馈纪律）；「可留空」语义废除（合成必须消费真实媒体）；成功播报含体积、时长对齐提示（「时长已按素材对齐 N.Ns（短于计划，防字幕漂移）」）与全就绪指路——「打开『成片』页签即自动合成」（自动合成挂在成片面板，页签未挂载不触发，文案不虚报）；换格式重贴自动清旧文件不留孤儿；
4. **文案对齐（P1）**：noop 失败原因/成片面失败行/批次落定播报统一「贴片入库（直链自动下载/本地上传）」口径——指引与能力一致。合成器本就按画幅 scale+crop+fps 归一重编码，任意来源/规格（横竖盘）素材皆可入片，底座未动。
**验收**：`verify-v298.cjs` 17/17（零生成配额——测试素材由本地 ffmpeg 合成 2s+5s testsrc2：API 造项目/3 场/2 镜 → 护栏双验（外链直 PATCH 422 指引 + 非视频地址 415 可读原因）→ 浏览器载入 → 镜A 直链下载入库（toast/plannedMs 3000→2000 对齐/clip_{id}.mp4 自包含落盘）→ 镜B 本地文件上传（全就绪指路）→ 打开成片页签自动合成 17s → 成片落盘 + 时长 7.5s（2.5 片头 + 2 + 5 − auto 转场重叠，时长对齐防漂移实证）→ 项目与素材清理零残留）；回归 verify-v293 12/12 + verify-v295 16/16 + verify-v296 全过 + verify-serial-landing 全过 + verify-seed-protocol 102/102 + verify-v297 快速面 16/16（新零配额夹具 `fixture-pending-project.cjs`：API 造 15 镜含 finalPrompt 的在制项目，v297 场景可随时复跑不再依赖真实流水线残留）+ verify-v297 批次面 4/4 + verify-approved-boot 13/13 + tsc/eslint src 零错误 + 零 pageerror。

### v2.9.7 —— 端到端真实创作流过程反馈 ✅ 已实施
（E2E 实拍驱动：试笔→开机→流水线→一键渲染→任务链全链路真机走查（真实 LLM/图像/TTS，视频 noop 零配额）；用户核心痛点「点击后一直转圈、不知道在干啥、没有过程和提醒」定位出四个独立来源——节流误伤、终态静默、批次静默、断链冻结）
1. **noop 视频任务假转圈根除（P0）**：视频提交节流 `VIDEO_SUBMIT_INTERVAL_MS=12s` 是为真机通道 429 保护设计的（v2.7），但 dispatcher 对通道无差别执行——占位模式下 15 个秒败 noop 任务被节流阀放行成每 6s 一个、每个还白烧第二次重试，一键渲染后任务中心持续爬行约 7 分钟（用户视角 = 永久转圈）；且违背 v2.4.3 已写明的验收语义「占位模式任务秒级落 failed」。修复：`VideoProvider` 接口新增 `remote` 能力声明（zai=true / noop=false），`throttleVideoSubmit()` 仅真机通道执行；noop 同步失败 throw `NonRetryableError`（确定性失败：重试必然同结果）→ `retryOrFail` 直落 failed 不回队。实测：15 镜 4.4s 全部落定、attempts 全=1、失败原因携带贴片指引（修复前 ~7 分钟 + 30 次无效执行）；真机通道行为不变（节流与重试照旧）；
2. **运行终态播报（P0）**：流水线杀青/中断此前完全静默——成功只自动切页签（用户在别的页签读剧本时毫无感知），失败连页签都不切（中断徽标藏在剧组进程页签里）。修复：page.tsx 订阅 activeRun 状态迁移，`running → succeeded` toast「全组杀青 · 制作包已就绪」+ 自动切「成片」页签（既有行为）；`running → failed` destructive toast「剧组中断：{run.error}——已完成阶段不丢失，可断点续拍」+ 自动切「剧组进程」页签（错误与断点续拍按钮就在眼前）。守卫：仅 `before === "running"` 的真实迁移播报，载入已终态项目不误报；
3. **任务批次落定播报（P0）**：任务终态此前只静默更新任务中心列表——单镜渲染在 noop 下秒败后，用户看着「渲染中…」按钮态等待一个永远不会来的回填。修复：`fetchTasks` 检测「上一拍有活跃 → 本拍全部落定」的迁移，一批一报（`notifyBatchSettled`）：全成功「渲染任务完成 · N 项（产物已自动回填）」；有失败「本批渲染 N 项未成功」+ 占位指引（逐镜贴片 / 启用真机通道，noop 感知）+ 首条原因截断展示；用户主动取消不播报。toast 经模块级 `toast()`（use-toast 本就是模块级 store，zustand 外可调用）；
4. **任务轮询断链自愈（P0）**：任务轮询是链式 setTimeout，catch 分支原样吞错不续排——一次网络抖动/dev 编译延迟即永久断链，任务冻结在「进行中」无人观测（run 轮询用 setInterval 无此问题）。修复：catch 内若快照仍有活跃任务则强制 `scheduleTaskPolling()` 续链；
5. **断线重进自动恢复（P1）**：「全组拍摄中，请勿离开本页（断线重进可自动恢复观测）」的承诺此前只兑现了一半——服务端阶段幂等会恢复，但浏览器刷新即丢整个会话，用户得手动从项目库找回。修复：localStorage 恢复键 `drama-workshop:last-project`（startPipeline / saveProject / loadProject / createNextEpisode 写入；closeSession / removeProject(当前) 清除），页面挂载 `restoreLastSession()` 自动拉回上次项目（run 观测与任务轮询随 loadProject 续接）+ 恢复 toast；项目已删除/网络失败清键不重试；
6. **另起新片入口（P1）**：会话态下唯一「新片」路径是刷新页面的副作用——恢复键上线后该路径消失，必须有显式入口。顶栏新增「另起新片」（会话态可见）：`closeSession()` 停双轮询器（顺带修复：run 轮询器不停会持续把已清空的 activeRun 写回来，任务轮询空转——closeSession/removeProject(当前) 此前都只清 state 不停轮询，属潜伏泄漏）+ 清恢复键，项目留库随时可回；拍摄中另起时 toast 诚实提示「剧组仍在后台拍摄，可从项目库回到本项目旁观进度」；
7. **通道模式共享探明（P1）**：`/api/channel` 探明结果（realVideo）此前由成片面板各自 fetch——上收 store（`videoChannelReal` + 幂等 `probeVideoChannel()`，页面挂载一次），成片面板与镜头轨单镜渲染共用；占位模式下渲染中文案/tooltip/提交回执统一换贴片指引口径（「视频通道渲染中（每镜约 60~90s）」→「视频任务快速落定中（占位模式 · 零配额）」；「已提交渲染，完成后自动回填成片」→「占位模式将秒级给出贴片指引（零配额），配音照常出片」；提交回执「秒级落为待处理」→「秒级落定并给出贴片指引」——与秒败事实一致）；
8. **试笔秒表（P2）**：真实推演 20~40s，仅步骤轮播无法区分「还在跑」与「卡死」——加载卡新增秒表行（「编剧室推演中 · 已进行 Ns」，store `generatingSince` 时间戳驱动，effect 内不做同步 setState）；开机指令下发期（POST /runs 未返回）按钮文案「剧组拍摄中 …」→「全组开机中…」（语义准确：还没开机谈不上拍摄中）；
9. **任务中心溢出计数（P2）**：`tasks.slice(0, 12)` 静默截断（一键渲染 15 镜 + 配音 = 20+ 任务时像「任务丢了」）→ 补「还有 N 个任务未展示（共 M）」。
**验收**：`verify-v297-journey.cjs` 9/9（真实旅程：秒表出现且递增 2s→4s / 过稿开机 CTA 承接 / 开机 toast / 拍摄中观测提示 / 恢复键写入 / 流水线真实终态 succeeded / 杀青 toast）；`verify-v297-batch.cjs` 6/6（载入接管 6 个在途定妆照任务→全部落定「渲染任务完成」播报；单镜渲染 noop 秒败→「本批渲染 1 项未成功」+ 占位指引 + 首条原因）；`verify-v297.cjs` 16/18 基线 + 补跑（冷启动无恢复劫持 / 项目库载入写键 / 刷新恢复 toast+会话就位 / 一键渲染 15 视频任务 4.4s 落定 + attempts 全 1 + 指引全带 / 成片面失败行 / 任务中心溢出计数 / 另起新片清键回空态；2 项断言曾因遗留孤儿定妆照在途延后落定属正确等待，批次专项脚本以干净环境复验通过）；回归 verify-v293 12/12 + verify-v295 16/16 + verify-v296 14/14 + verify-serial-landing 全过 + verify-seed-protocol 102/102 + verify-approved-boot 更新回访动线至 v2.9.7 恢复契约（重载自动恢复替代手动项目库载入）；tsc/eslint src 零错误；零 pageerror。外部通道消耗：试笔×2 + 开机×2（casting/directing 文本 + 24 定妆照图像 + 8 配音 TTS）——全部为真实创作流用量，视频零配额。

### v2.9.5 —— 连载生产线会话态表达 ✅ 已实施
（VLM 产品总监视角 16 视图全局走查驱动：空态动线 8 视 + 项目库 1 视 + 会话态 7 视；走查结论去伪存真——「空态无实时进度」为走查视角盲区（会话态有流水线导轨/剧组进程面板），「连载在会话态不可见」8 视图复现为最大真缺口）

1. **信息卡「系列连载」区块（P0）**：系列标题 + 集数统计 + 剧集 chips（第 N 集 + 状态点——成片已合成 emerald / 制作中 amber；当前集 amber 高亮；点击其他集 fetch 详情后 loadProject 直接切会话，多集切换不再绕道项目库）+ 全宽「续写第 N 集 · 沿用角色定妆」按钮；数据源 `GET /api/series/[id]`，`SeriesEpisodeSummary` 增 `finalVideoUrl`（服务/类型两处同源）；
2. **续写弹窗提升会话层**：`nextEpOpen/setNextEpOpen` 入 store，新组件 `next-episode-dialog.tsx` 页面层挂载——信息卡连载区块与成片交付区共用，续写从「只在成片页签可达」升级为会话级主动线（VLM：8 视图复现）；
3. **上集留钩回顾条**：弹窗内摘录卡点留钩场（`narrativeFunction === "cliffhanger"`，无则回退末场）：场名 + 画面描述（3 行截断）+ 金句——续写「接得住」的上下文现场（VLM P1：续写时无法对照上集内容）；
4. **AI 接钩子写本集走向（P1）**：`POST /api/projects/[id]/next-episode-synopsis` → `draftNextEpisodeSynopsis`（编剧室系统提示：承接上集钩子、不引入未铺垫新设定、按题材战术推进爽点、结尾留新钩；思考档跟随项目编剧深度；文本通道零视频配额）——起草结果填入框内可改，AI 只降门槛不代笔；实测 110 字草稿正确承接「旧账新算」钩子；
5. **制作包清单常显（P1）**：成片交付区注脚行「制作包含：镜头素材 · 定妆图 · 分镜表 · 字幕 · 配音 · 工程档案」（4 视图复现「ZIP 里有什么不可见」；hover title 之外的常显层）；
6. **载入落点（P1）**：订阅 dbId 变化（项目库载入/连载区块切集/续写切新集），已合成项目自动落「成片」页签——已完项目的终点是交付物；未合成项目不动页签（用户可能正对照另一集改剧本）；
7. **拍摄配置「进阶微调」定位（P2）**：面板尾部左对齐提示行「拿不准就用默认机组直接开机，配置随时可改，不影响已生成内容」——消除「这是必选项吗」的认知焦虑（多视图指出与「AI 自动执行」心智打架）；剧组语言保留（v2.9.3 原则不动），只补定位说明。
**验收**：`verify-v295.cjs` 16/16（载入落点/系列区块三断言/剧本页签跨页签续写/上集留钩取 cliffhanger 场/AI 按钮/继承说明回归/制作包清单/续写 CTA 回归/空态提示行/AI 接钩子 API 合约三断言/零 pageerror）；回归 verify-v293 12/12 + verify-serial-landing 全过 + verify-seed-protocol 102/102；VLM 视觉抽检 4/4 过（P2 左对齐建议已采纳落图）；tsc/eslint 零错误；零外部通道调用（仅文本通道一次合约验证）。

### v2.9.4 —— 提示词语言纪律完备 + 落地页连载身份表达 ✅ 已实施
（确定性映射体系补全：状态词/台词/动作段三面——中文只出现在它该在的地方，英文 prompt 零污染）
1. **场记状态映射扩容 + 词单同源**：STATE_NOTE_PROMPTS 22→31 键；STATE_NOTE_KEYS 内插导演拆镜提示词（规则 11），词表与约束单一来源；
2. **台词链路接口面收口**：subtitle 从 VideoRenderRequest/PromptInput 移除（无 provider 消费方，防未来误拼进画面提示词）——台词走 TTS 配音 + 字幕烧录，各归其位；
3. **动作段降级语义**：visualPrompt（英文首选）→ visualDesc（中文降级，历史/外部数据），不引入 LLM 即时翻译；
4. **种子协议同源（P0）**：finalPrompt 真组装器现算 + promptVersion 落指纹 + 10 镜独立英文动作句 + 状态注记挂对对象用词表词 + refPlan 场景全勤/去错挂道具；种子改 bun 运行；
5. **落地页连载身份**：示例成片徽标与语境条补「系列第 1 集 / 一键续写」表达（亮点卡讲能力，语境条讲身份）；
6. **种子协议验证固化**：`scripts/verify-seed-protocol.mjs`（bun 运行，102 断言）——DB finalPrompt 快照 = 组装器现算逐字节一致、七段语言纪律零中文、台词零入画、[Scene] 全勤、状态注记挂对对象且确定性翻译、「酒杯坠地」去错挂复核、framing 英文术语落地；
7. **旧晃动视频重渲染就绪（零生成准备）**：`scripts/rerender-manifest.mjs`——提示词状态（up_to_date/stale_anchor/unanchored）× 成片年代（媒体 mtime vs 摄影纪律截止）双轴盘点；`--apply` 零配额重锚（真组装器回写 finalPrompt/promptVersion）；执行单逐镜 curl 带真实 clipId 落 `db/rerender-manifest.json`（gitignore 本机状态），配额窗口打开后人工执行，工具绝不自动触发生成。
**验收**：verify-v293.cjs 12/12；verify-serial-landing.cjs 6/6；verify-seed-protocol.mjs 102/102（重播种后复跑）；重渲染盘点：演示集 10 镜中 9 镜待重渲（旧渲染成片，镜 3/5 受控技法标注）、镜 10 本就待出片；tsc src 零错误；零外部通道调用。

### v2.9.3 —— 模型参数用户语言化：剧组语言讲模型参数 ✅ 已实施
（产品原则：AI 剧组 ≠ 传统剧组，但必须保有传统专业性——底层是模型参数，创作语言是剧组语言；给模型看的用机器语言，给人看的用剧组语言）
1. **单一映射源（`drama.ts`）**：新增四个确定性映射函数——`videoModelCrewLabel`（Omni 1.2 Pro→主力机组 · Pro（单镜 8s · 1080p））、`thinkingLevelCrewLabel`（low→初稿直拍（low · 快出爆点））、`durationCrewLabel`（3/5/8→快切/标准镜/长镜头）、`resolutionCrewLabel`（540p/720p/1080p→样片粗剪/流媒体成片/高清母版）；与 SHOT_SIZE_PROMPTS 同款确定性映射模式：底层 id 入库不变（历史项目/连载继承零迁移），仅展示层取词，未命中回退工程值（新机型未登记仍可读）；
2. **拍摄配置面板**（工作台第三步，`model-config-panel.tsx`）：步骤名「模型配置」→「拍摄配置」；字段剧组化（AI 视频基模→拍摄机组、剧本思考深度→编剧室深度、分辨率→成片规格）；下拉项「剧组语言主词 + 工程值小注」——AI 特性诚实可见（不完全一样，但说的是剧组话）；机组切换联动默认时长/规格的既有行为不变；
3. **提示词增强→导演讲戏**：开关改名，副标说明改为「每镜自动补写英文电影级镜头语言（运镜/光影/质感）」——开关语义从技术功能变为创作动作；
4. **工程信息卡（`project-info-card.tsx`）**：参数格值一律走映射（拍摄机组/单镜规格/编剧深度/导演讲戏），不再向创作者泄漏裸工程值（low/medium/high/Omni 1.2 Flash）；
5. **导出 Markdown（`buildMarkdown`）**：元信息行同步（拍摄机组：**主力机组 · Pro（单镜 8s · 1080p）** · 单镜 8 秒 · 长镜头 · 成片 1080p · 高清母版）；
6. **LLM 系统提示词不动**（screenplay.ts 参数段保持工程语义）：给模型看的用机器语言，给人看的用剧组语言，各归其位；`genres.ts` 下拉常量 label 改由映射函数生成（单一来源，新增机型登记一处全链路生效）。
**验收**：`scripts/verify-v293.cjs` 12/12 断言（第三步标题/4 字段名/导演讲戏区块/4 下拉剧组语言选项逐项文本断言/信息卡字段与机组映射值/零裸思考深度工程值泄漏）；六张桌面端实拍均非空白；tsc src 零错误；零 pageerror；零外部通道调用。

### v2.9.2 —— 信任面与交付可达性（全局产品走查驱动）✅ 已实施
（VLM 产品总监视角 11 视图走查：两大高频缺口「黑箱播放器/不敢开机」与「产出物在库里不可见」）
1. **成片封面帧体系（P0）**：compose-service 合成后自动抽 25% 时长处高燃帧（ffprobe 时长 → ffmpeg 单帧，810 宽）落约定路径 `final_{id}_poster.jpg`——不落库不迁移，前端 `<video poster>` 按约定引用，旧成片 404 自动回退黑帧；抽取失败仅日志不阻断合成；落地页示例播放器与工作台成片播放器统一接线；
2. **落地页可干预性声明（P0）**：五阶段导览下新增声明条（产出留档可改 / 改锚点自动标受影响镜头只补拍该补的 / 失败断点续跑）——流水线确有中间审校机制，但空态只讲「自动执行」不讲「可干预」；
3. **项目库交付中枢（P0）**：`ProjectSummary` 增 `finalVideoUrl`，项目卡对已合成项目直接给「成片」「制作包」下载入口（`stopPropagation` 不误触载入）；
4. **资产页成片入口条（P1）**：与节奏页同款入口条（`onJumpToCut` 接线），主交付物从任意页签可达；
5. **节奏页分析→行动闭环（P1）**：`Meter` 组件增 `action` 槽，未达标项渲染直达按钮（去 AI 拆解分镜 / 去分镜表切换景别/运镜 / 去剧本改台词，`onJumpToBoard` 切页签）；
6. **种子数据运镜协议规范化（P0 数据纪律）**：seed 自造驼峰运镜名不在 `CAMERA_MOVEMENTS` 池内 → 节奏页运镜多样性 8 种算成 1 种；语义保真重映射 8 种规范机位（pan_horizontal/static_close/handheld/push/whip_pan/low_angle_tracking/top_down/orbit），种子直接建为系列第 1 集；
7. **回归基础设施**：`ui-verify-series.cjs` 断言动态化（API 预查集数 → 断言第 N+1 集）+ 自清理（DELETE 本次创建集并验证恢复）；项目库载入成功自动收起抽屉；新增 `scripts/verify-v292.cjs` 8 断言；
8. **仓库入口**：README.md（定位/六步叙事表/快速开始/结构/纪律）+ package.json 身份对齐 `drama-workshop@2.9.2`。
**验收**：`verify-v292.cjs` 8/8（交付入口可见可达/不误触/入口条跳转/达标清单 4 项全达标/全达标态零行动按钮）；`ui-verify-series.cjs` 8/8（动态断言 + 自清理零残留）；poster 帧像素级验证非黑屏（均亮 60.9 / 暗部 46%）；运镜徽标全链路渲染正确（场次级 3 + 镜头级 8 规范标签）；tsc/eslint src/ 零错误；零外部通道调用（VLM 仅图片理解）。

### v2.9 —— 产品交付面：连载生产线与制作包 ✅ 已实施
（全局产品走查驱动：VLM 产品总监视角审 5 视图，定位「连载零表达」「交付物只有 JSON」两个战略缺口；详见 §7.14）
1. **连载生产线产品化（P0）**：一键续写动线——独立项目自动 adopt 为系列第 1 集（幂等），`POST /api/projects/[id]/next-episode` 一键端点（题材/模型参数继承上一集，资产库默认克隆——同一角色跨集同一张脸）；UI 触点：成片页签交付区「续写下一集」CTA + Dialog（承接梗概必填 ≥10 字）、项目库系列分组头部直发、信息卡连载徽标；新集创建后自动切会话；
2. **制作包一键交付（P1）**：零依赖 ZIP（node:zlib deflateRaw + 手写 central directory/CRC32）；`GET /api/projects/[id]/package` 六段包结构（成片/镜头素材/定妆图/配音/文档[分镜表.md+字幕.srt]/工程档案.json）；产物只读 public/assets 白名单、缺文件优雅跳过；
3. **成片全局可达（P1）**：节奏轨道页顶部「本集成片已就绪 · 去成片」入口条直达成片页签；首页亮点改用户价值语言（去 ffmpeg 术语）并新增「系列连载 · 一键续集」「制作包一键下载」两卡；
4. **落地页信任实据（P1）**：手机预览 mockup 从静态占位（SHOT 03 假进度条）升级为可直接播放的示例成片（流水线实产 MP4，muted+controls+playsInline，preload=metadata 不预拉全量）——新用户 30 秒内可验证产出质量，把「产品承诺」变成「可验证的演示」。
**验收**：续写 API 合约实测（adopt→第 2 集→5 资产定妆全继承）；制作包实测 19 文件 24.1MB CRC 全过（SRT/配音/定妆图/镜头素材齐备）；`scripts/ui-verify-series.cjs` 6/6 断言（分组/徽标/CTA/弹窗/切会话/入口条）；tsc/eslint 零错误；零外部通道调用。

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
