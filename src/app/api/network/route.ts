import { NextResponse } from "next/server";
import os from "os";

export async function GET() {
  const interfaces = os.networkInterfaces();
  let lanIp = "unknown";
  let publicIp = "unknown";

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        lanIp = iface.address;
        break;
      }
    }
    if (lanIp !== "unknown") break;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as { ip?: string };
      if (data.ip) {
        publicIp = data.ip;
      }
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ lanIp, publicIp });
}
