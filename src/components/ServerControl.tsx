"use client";

import { useState, useEffect, useCallback } from "react";
import { Play, Square, RotateCcw, MemoryStick, Save } from "lucide-react";
import { useServer } from "@/contexts/ServerContext";

interface ServerControlProps {
  compact?: boolean;
}

export default function ServerControl({ compact }: ServerControlProps) {
  const { serverId, currentServer } = useServer();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [minMem, setMinMem] = useState(2);
  const [maxMem, setMaxMem] = useState(4);
  const [memSaved, setMemSaved] = useState(true);

  const status = currentServer?.status || "stopped";

  useEffect(() => {
    fetch(`/api/memory?server=${serverId}`)
      .then((res) => res.json())
      .then((data) => {
        setMinMem(data.minMemoryGB);
        setMaxMem(data.maxMemoryGB);
        setMemSaved(true);
      })
      .catch(() => {});
  }, [serverId]);

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

  const saveMemory = async () => {
    try {
      const res = await fetch(`/api/memory?server=${serverId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minMemoryGB: minMem, maxMemoryGB: maxMem }),
      });
      const data = await res.json();
      setMessage(data.message || data.error);
      if (data.success) setMemSaved(true);
    } catch {
      setMessage("Failed to save memory settings");
    }
  };

  if (compact) {
    return (
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
    );
  }

  return (
    <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Server Control</h2>
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              status === "running"
                ? "bg-den-green"
                : status === "starting" || status === "stopping"
                ? "bg-yellow-500 animate-pulse"
                : "bg-den-red"
            }`}
          />
          <span className="text-sm text-den-text-muted capitalize">{status}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => handleAction("start")}
          disabled={loading || status !== "stopped"}
          className="flex items-center gap-2 px-4 py-2 bg-den-green hover:bg-[#6db563] disabled:bg-den-border disabled:text-den-text-dim text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Play size={16} /> Start
        </button>
        <button
          onClick={() => handleAction("stop")}
          disabled={loading || status !== "running"}
          className="flex items-center gap-2 px-4 py-2 bg-den-red hover:bg-[#e53935] disabled:bg-den-border disabled:text-den-text-dim text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Square size={16} /> Stop
        </button>
        <button
          onClick={() => handleAction("restart")}
          disabled={loading || status !== "running"}
          className="flex items-center gap-2 px-4 py-2 bg-den-amber hover:bg-[#fb8c00] disabled:bg-den-border disabled:text-den-text-dim text-white rounded-lg transition-colors text-sm font-medium"
        >
          <RotateCcw size={16} /> Restart
        </button>
      </div>

      {/* Memory Allocation */}
      {currentServer?.type === "minecraft" && (
        <div className="mt-4 pt-4 border-t border-den-border">
          <div className="flex items-center gap-2 mb-3">
            <MemoryStick size={16} className="text-den-text-muted" />
            <span className="text-sm font-medium">Memory Allocation</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-den-text-muted">Min</label>
              <select
                value={minMem}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMinMem(val);
                  setMemSaved(false);
                  if (val > maxMem) setMaxMem(val);
                }}
                className="bg-den-surface text-den-text px-2 py-1.5 rounded-lg text-sm font-mono border border-den-border-light focus:outline-none focus:ring-1 focus:ring-den-cyan/40"
              >
                {[1, 2, 3, 4, 6, 8, 10, 12, 16].map((gb) => (
                  <option key={gb} value={gb}>{gb} GB</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-den-text-muted">Max</label>
              <select
                value={maxMem}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMaxMem(val);
                  setMemSaved(false);
                  if (val < minMem) setMinMem(val);
                }}
                className="bg-den-surface text-den-text px-2 py-1.5 rounded-lg text-sm font-mono border border-den-border-light focus:outline-none focus:ring-1 focus:ring-den-cyan/40"
              >
                {[1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32].map((gb) => (
                  <option key={gb} value={gb}>{gb} GB</option>
                ))}
              </select>
            </div>
            <button
              onClick={saveMemory}
              disabled={memSaved}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-den-cyan hover:bg-[#29b6f6] disabled:bg-den-border disabled:text-den-text-dim text-den-bg rounded-lg transition-colors font-medium"
            >
              <Save size={14} />
              {memSaved ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-den-text-muted">{message}</p>}
    </div>
  );
}
