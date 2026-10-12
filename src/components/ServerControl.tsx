"use client";

import { useState, useCallback, useEffect } from "react";
import { Play, Square, RotateCcw } from "lucide-react";
import { useServer } from "@/contexts/ServerContext";

/**
 * Floating start/stop/restart bar shown on the dashboard. Memory settings
 * live in minecraft/MemoryAllocation, rendered on the dashboard page itself.
 */
export default function ServerControl() {
  const { serverId, currentServer } = useServer();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const status = currentServer?.status || "stopped";

  // Surface the adapter's reply (e.g. "Cannot start a remote MC server...")
  // briefly, then get out of the way.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 8000);
    return () => clearTimeout(t);
  }, [message]);

  const handleAction = useCallback(async (action: string) => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/server?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setMessage(data.message);
    } catch {
      setMessage("Failed to send command");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  return (
    <div className="flex flex-col items-end gap-2">
      {message && (
        <div className="max-w-sm bg-den-card/90 backdrop-blur-sm border border-den-border rounded-lg px-3 py-2 text-[12px] text-den-text-muted shadow-lg">
          {message}
        </div>
      )}
      <div className="bg-den-card/90 backdrop-blur-sm border border-den-border rounded-xl p-3 flex items-center gap-2 shadow-lg">
        <button
          onClick={() => handleAction("start")}
          disabled={loading || status !== "stopped"}
          className="p-2 bg-den-green hover:bg-[#6db563] disabled:bg-den-border disabled:text-den-text-dim text-white rounded-lg transition-colors"
          title="Start"
        >
          <Play size={16} />
        </button>
        <button
          onClick={() => handleAction("stop")}
          disabled={loading || status !== "running"}
          className="p-2 bg-den-red hover:bg-[#e53935] disabled:bg-den-border disabled:text-den-text-dim text-white rounded-lg transition-colors"
          title="Stop"
        >
          <Square size={16} />
        </button>
        <button
          onClick={() => handleAction("restart")}
          disabled={loading || status !== "running"}
          className="p-2 bg-den-amber hover:bg-[#fb8c00] disabled:bg-den-border disabled:text-den-text-dim text-white rounded-lg transition-colors"
          title="Restart"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}
