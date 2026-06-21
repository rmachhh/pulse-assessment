import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { assertSameOrigin } from "@/lib/origin";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rateLimit";
import {
  createPublicSessionId,
  createSessionSecret,
  hashSessionSecret,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOIN_LIMIT = 20;
const JOIN_WINDOW_MS = 10 * 60 * 1000;

// POST /api/join — body { lat, lng } (raw coords).
// Applies a 1–3 km privacy offset and upserts the presence row. Raw
// coordinates are never stored.
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const joinLimit = await checkRateLimit({
    key: `join:${clientIp(request)}`,
    limit: JOIN_LIMIT,
    windowMs: JOIN_WINDOW_MS,
  });
  if (!joinLimit.allowed) return rateLimitResponse(joinLimit.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { lat, lng } = (body ?? {}) as Record<string, unknown>;

  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const id = createPublicSessionId();
  const secret = createSessionSecret();
  const offset = applyPrivacyOffset(lat as number, lng as number);

  await prisma.presence.create({
    data: {
      id,
      secretHash: hashSessionSecret(secret),
      lat: offset.lat,
      lng: offset.lng,
      busy: false,
      lastSeen: new Date(),
    },
  });

  const response = NextResponse.json({ id });
  response.cookies.set(sessionCookieName(id), secret, sessionCookieOptions());
  return response;
}
