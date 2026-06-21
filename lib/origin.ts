import type { NextRequest } from "next/server";

export function assertSameOrigin(request: NextRequest): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (!host) return Response.json({ error: "invalid origin" }, { status: 403 });

  try {
    const originUrl = new URL(origin);
    const expected = new URL(`${proto}://${host}`);
    if (originUrl.origin === expected.origin) return null;
  } catch {
    return Response.json({ error: "invalid origin" }, { status: 403 });
  }

  return Response.json({ error: "invalid origin" }, { status: 403 });
}
