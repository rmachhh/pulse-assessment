import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import {
  isValidSessionId,
  sessionCookieName,
  verifySessionOwner,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id }. Removes the presence row and any pending
// signals to/from this user. Called via navigator.sendBeacon on tab close, so
// the body may arrive as text — parse defensively.
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  let id: string | undefined;
  try {
    const text = await request.text();
    id = text ? (JSON.parse(text)?.id as string | undefined) : undefined;
  } catch {
    id = undefined;
  }

  if (!isValidSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  if (!(await verifySessionOwner(request, id))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const connections = await prisma.connection.findMany({
    where: { OR: [{ requesterId: id }, { targetId: id }] },
    select: { requesterId: true, targetId: true },
  });
  const releasedIds = connections
    .flatMap((connection) => [connection.requesterId, connection.targetId])
    .filter((peerId) => peerId !== id);

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });
  await prisma.connection.deleteMany({
    where: { OR: [{ requesterId: id }, { targetId: id }] },
  });
  await prisma.presence.deleteMany({ where: { id } });
  if (releasedIds.length > 0) {
    await prisma.presence.updateMany({
      where: { id: { in: releasedIds } },
      data: { busy: false },
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName(id), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
