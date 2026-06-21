import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_PREFIX = "pulse_session_";
const SESSION_SECRET_BYTES = 32;
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 6;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPublicSessionId(): string {
  return randomUUID();
}

export function createSessionSecret(): string {
  return randomBytes(SESSION_SECRET_BYTES).toString("base64url");
}

export function hashSessionSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function isValidSessionId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

export function sessionCookieName(id: string): string {
  return `${SESSION_COOKIE_PREFIX}${id}`;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

export async function verifySessionOwner(
  request: NextRequest,
  id: string,
): Promise<boolean> {
  const secret = request.cookies.get(sessionCookieName(id))?.value;
  if (!secret) return false;

  const presence = await prisma.presence.findUnique({
    where: { id },
    select: { secretHash: true },
  });
  if (!presence || !presence.secretHash) return false;

  const expected = Buffer.from(presence.secretHash, "hex");
  const actual = Buffer.from(hashSessionSecret(secret), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
