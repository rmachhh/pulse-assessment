import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import { rateLimitResponse } from "@/lib/rateLimit";
import { isValidSessionId, verifySessionOwner } from "@/lib/session";
import type { PollResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_POLL_INTERVAL_MS = 500;

// GET /api/poll?id= — the single endpoint that drives the live map.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the filtered online peers, and (4) drains this user's mailbox.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");

  if (!isValidSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  if (!(await verifySessionOwner(request, id))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  // 1) Heartbeat — refresh lastSeen for the caller.
  const heartbeat = await prisma.presence.updateMany({
    where: {
      id,
      lastSeen: { lt: new Date(now - MIN_POLL_INTERVAL_MS) },
    },
    data: { lastSeen: new Date(now) },
  });
  if (heartbeat.count === 0) return rateLimitResponse(1);

  // 2) Reap stale presence rows, their pairings, and orphaned signals
  // (independent deletes — no atomicity needed, and avoids transactions over a
  // PgBouncer pooler).
  const stalePresence = await prisma.presence.findMany({
    where: { lastSeen: { lt: staleCutoff } },
    select: { id: true },
  });
  const staleIds = stalePresence.map((p) => p.id);
  if (staleIds.length > 0) {
    const staleConnections = await prisma.connection.findMany({
      where: {
        OR: [
          { requesterId: { in: staleIds } },
          { targetId: { in: staleIds } },
        ],
      },
      select: { requesterId: true, targetId: true },
    });
    const releasedIds = staleConnections
      .flatMap((c) => [c.requesterId, c.targetId])
      .filter((peerId) => !staleIds.includes(peerId));

    await prisma.presence.deleteMany({ where: { id: { in: staleIds } } });
    await prisma.connection.deleteMany({
      where: {
        OR: [
          { requesterId: { in: staleIds } },
          { targetId: { in: staleIds } },
        ],
      },
    });
    if (releasedIds.length > 0) {
      await prisma.presence.updateMany({
        where: { id: { in: releasedIds } },
        data: { busy: false },
      });
    }
  }
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

  // 3) Online peers, excluding self.
  const peers = await prisma.presence.findMany({
    where: {
      id: { not: id },
      lastSeen: { gte: staleCutoff },
    },
    select: { id: true, lat: true, lng: true, busy: true },
  });

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const response: PollResponse = {
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      busy: p.busy,
    })),
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return Response.json(response);
}
