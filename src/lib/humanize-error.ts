/**
 * v2.9.13 错误人性化翻译层（用户视角走查 P0）：
 * 把文本通道 / 分镜拆解的底层技术错误翻译成剧组用户能看懂的中文 +
 * 明确的下一步行动建议。原则：
 * - 翻译只改「给人看」的展示文案；技术原始错误保留在括号内，排障不丢信息；
 * - 确定性映射：同一原始错误永远得到同一句话（与运镜确定性映射同一纪律）；
 * - 未命中任何已知模式时原样透传（绝不虚构原因）。
 */

export interface HumanizedError {
  /** 一句话人话标题（放进 journal / stages.error / run.error） */
  title: string;
  /** 给用户的下一步行动建议 */
  hint: string;
}

/** 已知错误模式的确定性映射表
 *  hint = 流水线口径（断点续拍）；retryHint = 独立动作口径（试笔/接钩子/
 *  单场拆解等无「阶段进度」可续的场景——不承诺「已完成的部分不会重做」，
 *  因为这些动作要么整体成功要么整体重来） */
const PATTERNS: Array<{
  test: RegExp;
  title: string;
  hint: string;
  retryHint: string;
}> = [
  {
    // 上游限流（429），文本通道已自动退避 20s/40s/80s 三轮
    test: /429|Too many requests|rate.?limit/i,
    title: "AI 创作通道繁忙（上游限流），系统已自动等待重试仍未成功",
    hint: "请稍等 1~2 分钟，点「断点续拍」从当前阶段继续——已完成的部分不会重做",
    retryHint: "请稍等 1~2 分钟后再试一次",
  },
  {
    // 上游服务端错误（5xx）
    test: /status 5\d\d|internal server error|bad gateway|service unavailable/i,
    title: "AI 创作服务暂时不可用（上游服务异常）",
    hint: "稍等片刻后点「断点续拍」重试，已完成阶段不会重复执行",
    retryHint: "稍等片刻后再试一次",
  },
  {
    // 网络层失败
    test: /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|socket hang up|EAI_AGAIN/i,
    title: "网络连接异常，AI 创作请求没有送达",
    hint: "请检查网络后点「断点续拍」重试",
    retryHint: "请检查网络后再试一次",
  },
  {
    // 请求超时
    test: /timeout|aborted|timed? ?out/i,
    title: "AI 创作请求超时（上游响应时间过长）",
    hint: "内容越深思考越久，可点「断点续拍」重试；反复超时可把「编剧深度」调低一档",
    retryHint: "稍后再试一次；反复超时可把「编剧深度」调低一档",
  },
  {
    // 模型返回被截断（finish_reason=length）
    test: /finish_reason|被截断|truncat|max_tokens/i,
    title: "AI 产出被长度上限截断，结果不完整",
    hint: "点「断点续拍」让剧组自动补写重试，或把「编剧深度」调低一档减轻产出压力",
    retryHint: "稍后再试一次，或把「编剧深度」调低一档减轻产出压力",
  },
  {
    // 结构化解析失败（JSON 不合法等）
    test: /解析失败|parse|JSON|Unexpected|invalid/i,
    title: "AI 产出格式不符合剧本工单规范，已重试仍未通过",
    hint: "点「断点续拍」再试一次（每次重试都会附加上更严格的格式提示）",
    retryHint: "再试一次（每次重试都会附加上更严格的格式提示）",
  },
  {
    // 模型返回空内容
    test: /空内容|empty/i,
    title: "AI 创作通道返回了空内容",
    hint: "偶发上游抖动，点「断点续拍」重试即可",
    retryHint: "偶发上游抖动，稍后再试即可",
  },
];

/**
 * 翻译底层错误为人话。未命中模式时返回 null（调用方保留原文）。
 * 不虚构：绝不把未知错误说成已知原因。
 */
export function humanizeError(raw: string): HumanizedError | null {
  for (const p of PATTERNS) {
    if (p.test.test(raw)) {
      return { title: p.title, hint: p.hint };
    }
  }
  return null;
}

/**
 * v2.9.14 独立动作口径（用户视角走查：试笔/接钩子/单场拆解撞 429 时，
 * 流水线的「断点续拍」话术不适用——这些动作没有阶段进度可续）。
 * 与 stageFailureText 同源同表：标题永远一致（同一错误绝不因入口不同而
 * 变因），仅行动建议按动作形态适配。未命中模式返回 null（调用方给通用
 * 兜底，不虚构原因）。
 */
export function standaloneFailureText(raw: string): string | null {
  for (const p of PATTERNS) {
    if (p.test.test(raw)) {
      return `${p.title}。${p.retryHint}`;
    }
  }
  return null;
}

/**
 * 组装最终展示文案：人话 + 行动建议 + 技术原始错误（供排障）。
 * journal / stages.error / run.error 统一走这里，三层口径一致。
 */
export function stageFailureText(raw: string): string {
  const h = humanizeError(raw);
  if (!h) return raw;
  // 技术原文压进括号，截断到 160 字防止 journal 刷屏
  const tech = raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
  return `${h.title}。${h.hint}（技术详情：${tech}）`;
}
