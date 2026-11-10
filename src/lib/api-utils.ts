import { NextResponse } from "next/server";

/**
 * 统一 API 响应封套
 * 成功: { ok: true, data }
 * 失败: { ok: false, error, detail? }
 * 所有路由必须经此返回，前端按 ok 字段判别
 */
export function ok<T>(data: T, init?: number | ResponseInit) {
  // Next.js 16 的 NextResponse.json 仅接受 ResponseInit；数字状态码需手动包装
  const resInit = typeof init === "number" ? { status: init } : init;
  return NextResponse.json({ ok: true as const, data }, resInit);
}

export function fail(error: string, status = 400, detail?: string) {
  return NextResponse.json(
    { ok: false as const, error, ...(detail ? { detail } : {}) },
    { status }
  );
}

/** 服务层抛出的业务错误 → 统一映射为 HTTP 响应 */
export function handleRouteError(err: unknown) {
  if (err instanceof RouteError) {
    return fail(err.message, err.status, err.detail);
  }
  const msg = err instanceof Error ? err.message : "服务器内部错误";
  return fail(`服务器内部错误：${msg}`, 500);
}

export class RouteError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status = 400, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}
