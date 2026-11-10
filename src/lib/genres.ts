import type { GenrePreset } from "./drama";

/**
 * 热门题材预设库 — 每个题材是一组完整的创作 preset：
 * 钩子策略 + 配乐情绪 + 英文影调 Prompt（AI 视频风格锚点）
 */
export const GENRES: GenrePreset[] = [
  {
    id: "shuangwen",
    name: "战神逆袭 · 龙王归来",
    short: "战神逆袭",
    badge: "高燃打脸 · 爽感爆棚",
    icon: "⚔️",
    hookTactic:
      "0~3s 冲突爆发：撕毁婚书当众羞辱，主角眼神冰冷，身份信物若隐若现",
    musicMood: "重低音震荡战鼓、霸气交响乐渐强、金属拔剑音效",
    tonePrompt:
      "high-contrast dramatic cinema, intense confrontation, low angle hero shot, cinematic lighting, gold and obsidian tones, high tension facial micro-expressions",
    gradient: "from-red-600 via-rose-600 to-amber-500",
    ring: "ring-red-500/70",
    text: "text-red-400",
    sampleSynopsis:
      "赘婿隐忍三年受尽欺凌，反派当众撕碎婚书泼菜汤；主角冷笑亮出信物，顶级统帅带十万将士破门而入跪地齐呼龙王！",
  },
  {
    id: "tianchong",
    name: "赘婿甜宠 · 隐藏首富",
    short: "赘婿甜宠",
    badge: "反差萌 · 甜到齁",
    icon: "💐",
    hookTactic:
      "0~3s 反差登场：主角被嘲讽吃软饭，转身低调接起神秘电话，声音是千亿集团会议的背景音",
    musicMood: "轻快钢琴与弦乐交织、心动瞬间八音盒音效、华丽转场重拍",
    tonePrompt:
      "warm romantic cinema, soft golden hour lighting, luxury penthouse aesthetic, gentle bokeh, champagne and blush tones, subtle smile close-ups",
    gradient: "from-rose-400 via-pink-500 to-amber-400",
    ring: "ring-rose-400/70",
    text: "text-rose-300",
    sampleSynopsis:
      "上门女婿被岳母当众羞辱让离婚，妻子攥紧他的手说要一起租房过苦日子；他心口一热，低头按下手机静音键——屏幕上还亮着集团股东大会的连线请求。",
  },
  {
    id: "chongsheng",
    name: "重生复仇 · 逆天改命",
    short: "重生复仇",
    badge: "前世记忆 · 步步为营",
    icon: "🕰️",
    hookTactic:
      "0~3s 死亡瞬间闪回：被害坠楼与睁眼回到十年前叠化，仇人笑脸特写与记忆重合",
    musicMood: "空灵女声吟唱渐入、心跳音效渐强、时钟倒转混响",
    tonePrompt:
      "moody revenge thriller, cold desaturated grade with crimson accents, rain-soaked night streets, dramatic rim lighting, flashback cross-fade aesthetic, piercing gaze close-ups",
    gradient: "from-slate-500 via-red-700 to-rose-500",
    ring: "ring-red-600/70",
    text: "text-rose-400",
    sampleSynopsis:
      "被闺蜜与未婚夫联手推下天台，睁眼却重生回大学开学日；她攥紧书包带走向人群中的两人，微笑着说出她们此刻还没做过、却注定败露的那件事。",
  },
  {
    id: "xuanyi",
    name: "悬疑反转 · 层层迷局",
    short: "悬疑反转",
    badge: "高能烧脑 · 真相反转",
    icon: "🔍",
    hookTactic:
      "0~3s 异常细节切入：欢庆画面中一个反常的冷笑特写，关键证据在背景里一闪而过",
    musicMood: "低频弦乐持续压迫、突然静默留白、玻璃碎裂与耳语声",
    tonePrompt:
      "neo-noir mystery thriller, desaturated teal and slate palette, harsh chiaroscuro shadows, voyeuristic framing, unreliable narrator tension, extreme detail insert shots",
    gradient: "from-zinc-500 via-teal-600 to-emerald-500",
    ring: "ring-teal-500/70",
    text: "text-teal-300",
    sampleSynopsis:
      "刑警队长在结案庆功宴上举杯致谢，角落里他口袋中的匿名手机突然震动；屏幕只有一行字：物证袋 07 号的 DNA 结果，和你苦追十年的人不匹配——他握杯的手停在半空，脸色骤变。",
  },
  {
    id: "chuanyue",
    name: "穿越古代 · 权谋天下",
    short: "穿越古代",
    badge: "步步惊心 · 扶摇直上",
    icon: "🏯",
    hookTactic:
      "0~3s 身份错位：现代灵魂睁眼身处古代宫廷，刺客刀光与手机屏幕碎影交错",
    musicMood: "古筝与编钟混响、战马嘶鸣、朝堂钟声回荡",
    tonePrompt:
      "epic period drama, imperial palace golden interiors, silk robes flowing, candlelit court intrigue, misty mountain vistas, majestic crane shots",
    gradient: "from-amber-500 via-yellow-600 to-stone-500",
    ring: "ring-amber-500/70",
    text: "text-amber-300",
    sampleSynopsis:
      "现代建筑设计师在机房加班时触电，醒来成了冷宫废妃；她用炭笔在墙上画出机关结构图，三日后皇帝深夜微服到访，看见她把整座皇城的暗道网络画了个通透。",
  },
  {
    id: "shenhao",
    name: "都市神豪 · 挥金如土",
    short: "都市神豪",
    badge: "低调奢华 · 土豪碾压",
    icon: "💰",
    hookTactic:
      "0~3s 装扮反差：主角穿地摊货进奢侈品店被驱赶，反手掏出黑金卡全店买下",
    musicMood: "电子节拍混搭嘻哈、钞票翻动音效、超跑引擎轰鸣",
    tonePrompt:
      "glossy aspirational lifestyle cinema, neon-lit city skylines, luxury car reflections, champagne gold highlights, slow-motion wealth flex shots, storefront glass glamour",
    gradient: "from-yellow-500 via-amber-500 to-orange-600",
    ring: "ring-amber-400/70",
    text: "text-yellow-300",
    sampleSynopsis:
      "外卖员穿着骑手服给前女友的订婚宴送最后一单，被保安拦在酒店旋转门外；他低头看了眼手机余额，转身拨通管家电话：把这家酒店连着楼顶停机坪，一起买下来。",
  },
  {
    id: "zongcai",
    name: "霸道总裁 · 强势契约",
    short: "霸道总裁",
    badge: "高冷禁欲 · 先婚后爱",
    icon: "🍷",
    hookTactic:
      "0~3s 契约碰撞：一纸婚约甩在桌上，男主俯身逼近，眼神危险而克制",
    musicMood: "大提琴沉郁主旋律、电梯开门音效、高跟鞋走廊回响",
    tonePrompt:
      "sleek corporate romance, glass office skyline views, monochrome suits with crimson accents, rain on window intimacy, elevator tension close-ups, slow push-in power framing",
    gradient: "from-stone-600 via-neutral-700 to-red-600",
    ring: "ring-stone-400/70",
    text: "text-stone-300",
    sampleSynopsis:
      "为了救回被抵押的公司，她在家族联姻协议上签下自己的名字；电梯门打开的瞬间，传闻中从不露面的执行总裁弯腰拾起她的笔，说合同第七条——婚后他亲自拟定。",
  },
  {
    id: "majia",
    name: "马甲大佬 · 全能团宠",
    short: "马甲大佬",
    badge: "大佬马甲 · 逐层揭开",
    icon: "🎭",
    hookTactic:
      "0~3s 身份亮相：被全场嘲小看的路人，直播镜头意外扫过其与世界领奖台的合影",
    musicMood: "电音混搭军鼓、消息提示音连响、全场哗然人声鼎沸",
    tonePrompt:
      "high-energy identity reveal cinema, medical lab and esports stage mixed aesthetics, dramatic spotlight reveals, crisp detail insert shots, crowd reaction wide shots",
    gradient: "from-violet-600 via-fuchsia-500 to-rose-500",
    ring: "ring-fuchsia-400/70",
    text: "text-fuchsia-300",
    sampleSynopsis:
      "电竞战队垫底替补被解约当晚，直播间弹幕刷满嘲讽；镜头无意扫过她房间墙上的合影——照片里她穿着国家联队队服，站在世界赛领奖台最高处，全网瞬间安静了。",
  },
];

export const VIDEO_MODELS = [
  { id: "Omni 1.2 Flash", label: "Omni 1.2 Flash（5s / 720p 标准出片）" },
  { id: "Omni 1.2 Pro", label: "Omni 1.2 Pro（8s / 1080p 高质出片）" },
];

export const DURATIONS = [3, 5, 8];
export const RESOLUTIONS = ["540p", "720p", "1080p"];

export const THINKING_LEVELS = [
  { id: "low", label: "low · 直给爆点（快）" },
  { id: "medium", label: "medium · 节奏铺垫（均衡）" },
  { id: "high", label: "high · 伏笔回收（深）" },
];
