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

const g = globalThis as unknown as {
  __dramaProviders?: {
    text: TextProvider;
    image: ImageProvider;
    video: VideoProvider;
    voice: VoiceProvider;
  };
};

function providers() {
  if (!g.__dramaProviders) {
    g.__dramaProviders = {
      text: process.env.TEXT_PROVIDER === "noop" ? new NoopText() : new ZaiTextProvider(),
      image: new ZaiImageProvider(),
      // 真实视频通道（异步任务制）；VIDEO_PROVIDER=noop 降级占位
      video:
        process.env.VIDEO_PROVIDER === "noop"
          ? new NoopVideoProvider()
          : new ZaiVideoProvider(),
      voice: new ZaiVoiceProvider(),
    };
  }
  return g.__dramaProviders;
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
