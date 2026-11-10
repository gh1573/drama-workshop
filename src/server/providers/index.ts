/**
 * Provider 层统一出口（docs/architecture-v2.md §6/§7.4）。
 * 业务层只允许从这里 import，不允许深路径直连实现文件。
 */
export { getTextProvider, getImageProvider, getVideoProvider } from "./factory";
export {
  parseJsonLoose,
  IMAGE_SIZES,
  type TextMessage,
  type TextRequest,
  type TextResult,
  type TextProvider,
  type ImageSize,
  type ImageRequest,
  type ImageResult,
  type ImageProvider,
  type VideoRenderRequest,
  type VideoRenderResult,
  type VideoProvider,
} from "./types";
