import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isValidSessionId, verifySessionOwner } from "@/lib/session";
import type { SignalType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

const MAX_PAYLOAD = 64 * 1024; // SDP/ICE are small; cap to be safe.
const LIVE_CONNECTION_STATUSES = ["pending", "accepted"];
const CONTROL_SIGNAL_TYPES = ["request", "accept", "decline", "end"];
const CONTROL_SIGNAL_LIMIT = 30;
const WEBRTC_SIGNAL_LIMIT = 180;
const SIGNAL_WINDOW_MS = 60 * 1000;

// POST /api/signal — body { fromId, toId, type, payload? }
// Drops one message into the recipient's mailbox. Also manages the `busy`
// flag so a user can only be in one connection at a time.
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { fromId, toId, type, payload } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isValidSessionId(fromId) || !isValidSessionId(toId) || fromId === toId) {
    return Response.json({ error: "invalid ids" }, { status: 400 });
  }
  if (!(await verifySessionOwner(request, fromId))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return Response.json({ error: "invalid type" }, { status: 400 });
  }
  if (
    payload !== undefined &&
    payload !== null &&
    (typeof payload !== "string" || payload.length > MAX_PAYLOAD)
  ) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  const signalType = type as SignalType;
  const signalLimit = await checkRateLimit({
    key: `signal:${signalType}:${fromId}`,
    limit: CONTROL_SIGNAL_TYPES.includes(signalType)
      ? CONTROL_SIGNAL_LIMIT
      : WEBRTC_SIGNAL_LIMIT,
    windowMs: SIGNAL_WINDOW_MS,
  });
  if (!signalLimit.allowed) return rateLimitResponse(signalLimit.retryAfter);

  const payloadStr = typeof payload === "string" ? payload : null;
  const target = await prisma.presence.findUnique({
    where: { id: toId },
    select: { busy: true },
  });

  switch (signalType) {
    case "request": {
      if (!target) {
        await sendDecline(toId, fromId);
        return Response.json({ ok: true, autoDeclined: true });
      }

      const sender = await prisma.presence.findUnique({
        where: { id: fromId },
        select: { busy: true },
      });
      const existingConnection = await prisma.connection.findFirst({
        where: {
          status: { in: LIVE_CONNECTION_STATUSES },
          OR: [
            { requesterId: { in: [fromId, toId] } },
            { targetId: { in: [fromId, toId] } },
          ],
        },
        select: { id: true },
      });

      if (!sender || sender.busy || target.busy || existingConnection) {
        await sendDecline(toId, fromId);
        return Response.json({ ok: true, autoDeclined: true });
      }

      await prisma.connection.create({
        data: { requesterId: fromId, targetId: toId, status: "pending" },
      });
      break;
    }

    case "accept": {
      if (!target) {
        return Response.json({ error: "target offline" }, { status: 404 });
      }
      const connection = await findPendingConnection(toId, fromId);
      if (!connection) {
        return Response.json({ error: "invalid connection state" }, { status: 409 });
      }

      await prisma.connection.updateMany({
        where: { id: connection.id, status: "pending" },
        data: { status: "accepted" },
      });
      await prisma.presence.updateMany({
        where: { id: { in: [fromId, toId] } },
        data: { busy: true },
      });
      break;
    }

    case "decline": {
      const connection = await findPendingConnection(toId, fromId);
      if (!connection) {
        return Response.json({ error: "invalid connection state" }, { status: 409 });
      }

      await prisma.connection.deleteMany({ where: { id: connection.id } });
      await prisma.presence.updateMany({
        where: { id: { in: [fromId, toId] } },
        data: { busy: false },
      });
      break;
    }

    case "end": {
      const connection = await findPairConnection(fromId, toId);
      if (!connection) {
        return Response.json({ ok: true, ignored: true });
      }

      await prisma.connection.deleteMany({ where: { id: connection.id } });
      await prisma.presence.updateMany({
        where: { id: { in: [fromId, toId] } },
        data: { busy: false },
      });
      break;
    }

    case "offer":
    case "answer":
    case "ice": {
      if (!target) {
        return Response.json({ error: "target offline" }, { status: 404 });
      }
      const connection = await findPairConnection(fromId, toId, "accepted");
      if (!connection) {
        return Response.json({ error: "invalid connection state" }, { status: 409 });
      }
      break;
    }
  }

  await prisma.signal.create({
    data: { fromId, toId, type: signalType, payload: payloadStr },
  });

  return Response.json({ ok: true });
}

// Helper: deliver an auto-decline from `target` back to `initiator`.
async function sendDecline(targetId: string, initiatorId: string) {
  await prisma.signal.create({
    data: { fromId: targetId, toId: initiatorId, type: "decline", payload: null },
  });
}

async function findPendingConnection(requesterId: string, targetId: string) {
  return prisma.connection.findFirst({
    where: { requesterId, targetId, status: "pending" },
    select: { id: true },
  });
}

async function findPairConnection(
  firstId: string,
  secondId: string,
  status?: "pending" | "accepted",
) {
  return prisma.connection.findFirst({
    where: {
      ...(status ? { status } : { status: { in: LIVE_CONNECTION_STATUSES } }),
      OR: [
        { requesterId: firstId, targetId: secondId },
        { requesterId: secondId, targetId: firstId },
      ],
    },
    select: { id: true },
  });
}
