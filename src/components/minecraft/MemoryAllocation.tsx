"use client";

import { useState, useEffect } from "react";
import { MemoryStick, Save } from "lucide-react";
import { useServer } from "@/contexts/ServerContext";

/**
 * -Xms / -Xmx for a locally launched Minecraft server, stored in
 * dashboard-config.json in the server dir and applied on the next start.
 * Not shown for remote servers (rconHost set): the dashboard doesn't spawn
 * their JVM, so these values would never be used.
 */
export default function MemoryAllocation() {
  const { serverId, currentServer } = useServer();
  const [minMem, setMinMem] = useState(2);
  const [maxMem, setMaxMem] = useState(4);
  const [memSaved, setMemSaved] = useState(true);
  const [message, setMessage] = useState("");

  const visible = currentServer?.type === "minecraft" && !currentServer.rconHost;

  useEffect(() => {
    if (!serverId || !visible) return;
    fetch(`/api/memory?server=${serverId}`)
      .then((res) => res.json())
      .then((data) => {
        setMinMem(data.minMemoryGB);
        setMaxMem(data.maxMemoryGB);
        setMemSaved(true);
        setMessage("");
      })
      .catch(() => {});
  }, [serverId, visible]);

  if (!visible) return null;

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

  const selectClass =
    "bg-den-surface text-den-text px-2 py-1.5 rounded-lg text-sm font-mono border border-den-border-light focus:outline-none focus:ring-1 focus:ring-den-cyan/40";

  return (
    <section className="den-card overflow-hidden">
      <div className="den-card-header !justify-start gap-2">
        <MemoryStick size={16} className="text-den-text-muted" />
        <h3 className="den-card-title">Memory allocation</h3>
      </div>
      <div className="p-5">
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
              className={selectClass}
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
              className={selectClass}
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
        <p className="mt-3 text-[12px] text-den-text-dim">
          {message || "Applied the next time the dashboard starts the server."}
        </p>
      </div>
    </section>
  );
}
