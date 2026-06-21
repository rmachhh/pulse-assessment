import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

export function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);
  const bucketKey = `${key}:${windowStart}`;

  const bucket = await prisma.rateLimit.upsert({
    where: { key: bucketKey },
    create: { key: bucketKey, count: 1, expiresAt },
    update: { count: { increment: 1 } },
    select: { count: true, expiresAt: true },
  });

  if (Math.random() < 0.02) {
    await prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  }

  return {
    allowed: bucket.count <= limit,
    retryAfter: Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now) / 1000)),
  };
}

export function rateLimitResponse(retryAfter: number): Response {
  return Response.json(
    { error: "rate limit exceeded" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
