"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useState, useCallback } from "react";
import { Clock, Calendar } from "lucide-react";

interface BackupEntry {
  name: string;
  size: string;
  sizeBytes: number;
  date: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BackupManager() {
  const { serverId, currentServer } = useServer();
  const [hourly, setHourly] = useState<BackupEntry[]>([]);
  const [daily, setDaily] = useState<BackupEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const loadBackups = useCallback(async () => {
    try {
      const res = await fetch(`/api/backups?server=${serverId}`);
      const data = await res.json();
      setHourly(data.hourly || []);
      setDaily(data.daily || []);
    } catch {
      // ignore
    }
  }, [serverId]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const runBackup = async (type: "hourly" | "daily") => {
    setRunning(true);
    setMessage(`Running ${type} backup...`);
    try {
      const res = await fetch(`/api/backups?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`${type.charAt(0).toUpperCase() + type.slice(1)} backup completed!`);
        loadBackups();
      } else {
        setMessage(`Backup failed: ${data.message || data.error || "Unknown error"}`);
      }
    } catch {
      setMessage("Backup failed");
    } finally {
      setRunning(false);
    }
  };

  if (!currentServer) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => runBackup("hourly")}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-den-cyan to-[#29b6f6] text-den-bg rounded-lg text-sm font-semibold hover:brightness-110 hover:shadow-[0_0_16px_rgba(79,195,247,0.3)] disabled:opacity-50 transition-all"
        >
          <Clock size={16} />
          Run Hourly Backup
        </button>
        <button
          onClick={() => runBackup("daily")}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-den-elevated text-den-text border border-den-border rounded-lg text-sm font-semibold hover:bg-den-border transition-colors disabled:opacity-50"
        >
          <Calendar size={16} />
          Run Daily Backup
        </button>
      </div>

      {message && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-den-cyan-dim/20 text-den-cyan border border-den-cyan/30">
          {message}
        </div>
      )}

      {/* Two-column backup lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hourly */}
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Hourly Backups</h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-den-elevated text-den-text-muted border border-den-border">
              {hourly.length}
            </span>
          </div>
          <div className="p-3 max-h-[500px] overflow-y-auto">
            {hourly.length === 0 ? (
              <div className="text-center py-10 text-den-text-dim text-[13px]">No hourly backups found</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {hourly.map((b) => (
                  <div
                    key={b.name}
                    className="flex items-center justify-between px-3 py-2.5 bg-den-surface rounded-md border border-transparent hover:border-den-border transition-colors"
                  >
                    <span className="text-xs font-semibold font-mono">{b.name}</span>
                    <div className="flex gap-3 text-[11px] text-den-text-dim">
                      <span>{b.size}</span>
                      <span>{formatDate(b.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Daily */}
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Daily Backups</h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-den-elevated text-den-text-muted border border-den-border">
              {daily.length}
            </span>
          </div>
          <div className="p-3 max-h-[500px] overflow-y-auto">
            {daily.length === 0 ? (
              <div className="text-center py-10 text-den-text-dim text-[13px]">No daily backups found</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {daily.map((b) => (
                  <div
                    key={b.name}
                    className="flex items-center justify-between px-3 py-2.5 bg-den-surface rounded-md border border-transparent hover:border-den-border transition-colors"
                  >
                    <span className="text-xs font-semibold font-mono">{b.name}</span>
                    <div className="flex gap-3 text-[11px] text-den-text-dim">
                      <span>{b.size}</span>
                      <span>{formatDate(b.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
