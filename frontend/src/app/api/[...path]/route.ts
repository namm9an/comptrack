import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.INTERNAL_API_URL ?? "http://backend:8081";

// Headers that must not be forwarded to the backend — stripping these prevents
// clients from spoofing X-Forwarded-For to bypass IP restriction (security C4/H1).
// The proxy sets its own single-hop XFF instead.
const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "forwarded",
]);

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const targetPath = path.join("/");
  const url = `${BACKEND_URL}/api/${targetPath}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!STRIP_HEADERS.has(k.toLowerCase())) {
      headers.set(k, v);
    }
  });

  // Set a single authoritative XFF — backend can trust this because it comes from
  // this proxy (whose IP is in TRUSTED_PROXIES on the backend).
  const browserIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  headers.set("x-forwarded-for", browserIp);

  const init: RequestInit = {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    // @ts-expect-error duplex required for streaming body
    duplex: "half",
  };

  const upstream = await fetch(url, init);
  const body = await upstream.arrayBuffer();

  const res = new NextResponse(body, { status: upstream.status });

  upstream.headers.forEach((v, k) => {
    if (!["transfer-encoding", "connection"].includes(k.toLowerCase())) {
      res.headers.set(k, v);
    }
  });

  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
