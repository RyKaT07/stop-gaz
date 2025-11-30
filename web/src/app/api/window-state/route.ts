import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.AGGREGATOR_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

const WINDOW_STATE_URL = `${API_BASE}/window-state`;

async function proxyWindowState(method: "GET" | "POST", body?: unknown) {
  try {
    const response = await fetch(WINDOW_STATE_URL, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Window state proxy error", error);
    return NextResponse.json(
      { error: "Upstream window-state request failed" },
      { status: 502 },
    );
  }
}

export async function GET() {
  return proxyWindowState("GET");
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  return proxyWindowState("POST", payload);
}
