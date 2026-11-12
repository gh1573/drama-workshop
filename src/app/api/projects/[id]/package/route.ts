import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api-utils";
import { buildProductionPackage } from "@/server/services/package-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 一键下载制作包（v2.9 产品交付面）。
 *
 * ZIP 内容（见 package-service 头注）：成片 / 镜头素材 / 定妆图 /
 * 配音 / 分镜表.md / 字幕.srt / 工程档案.json。
 * 二进制响应不走 ok/fail 封套；错误仍走统一 RouteError 处理。
 * 文件名含中文：Content-Disposition 用 RFC 5987（filename*）编码。
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { buffer, filename } = await buildProductionPackage(id);
    const encoded = encodeURIComponent(filename);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="package.zip"; filename*=UTF-8''${encoded}`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
