import { NextResponse } from "next/server";
import { getVideoProvider } from "@/server/providers";

/**
 * 通道模式查询（docs §7.4 通道缺省策略）：
 * 前端据此展示「占位模式」提示——视频通道是否真机由环境变量决定，
 * 客户端无法推断，必须由服务端透出，保证状态可见性。
 */
export async function GET() {
  const provider = getVideoProvider("default");
  return NextResponse.json(
    {
      ok: true,
      data: {
        videoProvider: provider.name, // "noop-video"（占位） | "zai-video"（真机）
        realVideo: provider.name === "zai-video",
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
