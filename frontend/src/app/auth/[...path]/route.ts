import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.INTERNAL_API_URL ?? "http://backend:8081";

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
  const url = `${BACKEND_URL}/auth/${targetPath}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!STRIP_HEADERS.has(k.toLowerCase())) {
      headers.set(k, v);
    }
  });

  const browserIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  headers.set("x-forwarded-for", browserIp);

  const init: RequestInit = {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    redirect: "manual",
    // @ts-expect-error duplex required for streaming body
    duplex: "half",
  };

  const upstream = await fetch(url, init);

  // Forward redirects transparently (OAuth flow requires this)
  if ([301, 302, 303, 307, 308].includes(upstream.status)) {
    const location = upstream.headers.get("location");
    if (location) {
      const redirect = NextResponse.redirect(location, upstream.status);
      // Forward Set-Cookie headers (auth cookies set during OAuth callback)
      upstream.headers.forEach((v, k) => {
        if (k.toLowerCase() === "set-cookie") {
          redirect.headers.append("set-cookie", v);
        }
      });
      return redirect;
    }
  }

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
