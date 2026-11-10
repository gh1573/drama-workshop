import ZAI from "z-ai-web-dev-sdk";
import type {
  ImageProvider,
  ImageRequest,
  ImageResult,
  ImageSize,
} from "./types";

/**
 * 图像通道实现（images.generations）—— 资产定妆照的唯一来源。
 * 定妆照是角色一致性锚定的视觉载体：同一 visualAnchor → 同一形象基调。
 */
export class ZaiImageProvider implements ImageProvider {
  readonly name = "zai-image";

  async generate(req: ImageRequest): Promise<ImageResult> {
    const zai = await ZAI.create();
    const response = await zai.images.generations.create({
      prompt: req.prompt,
      size: req.size,
    });
    const base64 = response.data?.[0]?.base64;
    if (!base64) throw new Error("图像通道未返回图片数据");
    return { base64, size: req.size as ImageSize };
  }
}
