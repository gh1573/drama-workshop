import type {
  ImageProvider,
  TextProvider,
  VideoProvider,
  VoiceProvider,
} from "./types";
import { ZaiTextProvider } from "./zai-text";
import { ZaiImageProvider } from "./zai-image";
import { ZaiVoiceProvider } from "./zai-voice";
import { ZaiVideoProvider } from "./zai-video";
import { NoopVideoProvider } from "./noop-video";

/**
 * Provider 工厂 —— 业务层获取通道的唯一出口。
 * 通道选择读环境变量，默认内置通道；接入新模型只改这里。
 */

/**
 * v2.9.13 去除 globalThis 实例缓存（用户视角走查实捕）：
 * 所有 Provider 实现均无状态（complete/generate/render 只依赖入参），
 * 实例创建零成本；而 dev 热重载下模块重载后 globalThis 里的旧实例
 * 继续持有旧方法体——v2.9.13 的 onRetry 回调因此从未生效（实捕：
 * journal 有心跳无重试日志，端到端单测 onRetry 触发正常）。
 * 生产构建无热重载不受影响，但缓存无收益只有滞留风险，直接移除。
 */
function providers() {
  return {
    text: process.env.TEXT_PROVIDER === "noop" ? new NoopText() : new ZaiTextProvider(),
    image: new ZaiImageProvider(),
    /**
     * 视频通道缺省策略（docs §7.4 通道缺省策略，v2.4.3）：
     * 缺省 = noop 占位（零配额消耗，任务秒级落 failed + 引导贴片）；
     * 显式 VIDEO_PROVIDER=zai 才接真机异步通道（配额窗口由运维决策开启）。
     */
    video:
      process.env.VIDEO_PROVIDER === "zai"
        ? new ZaiVideoProvider()
        : new NoopVideoProvider(),
    voice: new ZaiVoiceProvider(),
  };
}

export function getTextProvider(): TextProvider {
  return providers().text;
}

export function getImageProvider(): ImageProvider {
  return providers().image;
}

export function getVoiceProvider(): VoiceProvider {
  return providers().voice;
}

export function getVideoProvider(_videoModel: string): VideoProvider {
  // 未来按 videoModel 路由到不同实现；当前统一降级通道
  void _videoModel;
  return providers().video;
}

/** 测试/演示用空文本通道 */
class NoopText implements TextProvider {
  readonly name = "noop-text";
  async complete() {
    return { text: "{}" };
  }
}
