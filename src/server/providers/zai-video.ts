import ZAI from "z-ai-web-dev-sdk";
import type {
  VideoProvider,
  VideoRenderRequest,
  VideoRenderResult,
  VideoSyncResult,
} from "./types";
import {
  RATE_LIMIT_BACKOFF_MS,
  RATE_LIMIT_MAX_BACKOFF_ATTEMPTS,
} from "@/config/runtime";

/**
 * 视频通道实现（video.generations + async.result.query）。
 *
 * 通道特性：异步任务制 —— create 受理后立即返回任务句柄，
 * 成片需持句柄轮询（实测 5s 竖屏成片约 60~90s）。
 * 因此 render() 返回 { mode: "async", remoteTaskId }，
 * 轮询由 dispatcher 持久化句柄统一驱动（§7.3/§7.4），进程重启不丢任务。
 *
 * 限流语义：通道对 create 频率敏感（批量瞬时提交触发 429）。
 * 与文本通道同源的指数退避（20s/40s/80s，配置 §7.8 L2 层），
 * 叠加随机抖动（0~50%）——批量任务同时退避后同时重试会自我雪崩。
 *
 * 一致性锚定：通道支持公网首帧参考图（image_url）；
 * 本地定妆照无法被外部通道访问时不传，提示词内的视觉锚点串兜底（§7.1）。
 */

/** 画幅映射：产品侧 aspectRatio × resolution → 通道 size 参数 */
const SIZE_MAP: Record<string, string> = {
  "9:16|720p": "720x1280",
  "9:16|1080p": "1080x1920",
  "16:9|720p": "1280x720",
  "16:9|1080p": "1920x1080",
  "1:1|720p": "720x720",
  "1:1|1080p": "1080x1080",
};

/** 通道时长档位（秒）：产品侧单镜时长就近取档 */
const DURATION_STEPS = [5, 10];

function nearestDurationStep(seconds: number): number {
  return DURATION_STEPS.reduce((best, step) =>
    Math.abs(step - seconds) < Math.abs(best - seconds) ? step : best
  );
}

/** 从轮询响应中提取成片地址（不同版本字段名兼容） */
function extractMediaUrl(res: {
  video_result?: Array<{ url?: string }>;
  video_url?: string;
  url?: string;
  video?: string;
}): string | undefined {
  return (
    res.video_result?.[0]?.url ?? res.video_url ?? res.url ?? res.video ?? undefined
  );
}

export class ZaiVideoProvider implements VideoProvider {
  readonly name = "zai-video";

  async render(req: VideoRenderRequest): Promise<VideoRenderResult> {
    const zai = await ZAI.create();
    const body = {
      prompt: req.finalPrompt,
      size: SIZE_MAP[`${req.aspectRatio}|${req.resolution}`] ?? "720x1280",
      duration: nearestDurationStep(req.durationSeconds),
      quality: "speed" as const,
      fps: 30,
      with_audio: false,
      watermark_enabled: false,
      ...(req.firstFrameUrl ? { image_url: req.firstFrameUrl } : {}),
    };

    // 429 指数退避 + 随机抖动（0~50%）：批量提交撞限流时错峰重试
    let backoff = 0;
    while (true) {
      try {
        const created = await zai.video.generations.create(body);
        if (!created?.id) {
          throw new Error("视频通道未返回任务句柄");
        }
        return { mode: "async", remoteTaskId: created.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isRateLimit = message.includes("429") || message.includes("Too many");
        if (isRateLimit && backoff < RATE_LIMIT_MAX_BACKOFF_ATTEMPTS) {
          const jitter = Math.random() * 0.5; // 0~50% 抖动
          const delay = RATE_LIMIT_BACKOFF_MS * 2 ** backoff * (1 + jitter);
          await new Promise((r) => setTimeout(r, delay));
          backoff += 1;
          continue;
        }
        throw err;
      }
    }
  }

  async poll(remoteTaskId: string): Promise<VideoSyncResult> {
    const zai = await ZAI.create();
    const res = await zai.async.result.query(remoteTaskId);
    if (res.task_status === "PROCESSING") {
      return { mode: "sync", status: "processing" };
    }
    if (res.task_status === "SUCCESS") {
      const mediaUrl = extractMediaUrl(res);
      if (!mediaUrl) {
        return {
          mode: "sync",
          status: "failed",
          reason: "视频通道返回成功但未携带成片地址",
        };
      }
      return { mode: "sync", status: "ready", mediaUrl };
    }
    return {
      mode: "sync",
      status: "failed",
      reason: "视频通道渲染失败（任务被服务端终止）",
    };
  }
}
