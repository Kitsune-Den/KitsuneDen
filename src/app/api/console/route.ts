import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

// GET existing logs
export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }
  return NextResponse.json({ logs: adapter.getLogs() });
}

// POST for SSE live log streaming
export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send existing logs first
      const existingLogs = adapter.getLogs();
      existingLogs.forEach((line) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ line })}\n\n`)
        );
      });

      // Listen for new logs
      const unsubscribe = adapter.onLog((line) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ line })}\n\n`)
          );
        } catch {
          unsubscribe();
        }
      });

      // Keepalive
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(interval);
          unsubscribe();
        }
      }, 15000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
