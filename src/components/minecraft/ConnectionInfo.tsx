"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

export default function ConnectionInfo() {
  const { currentServer } = useServer();
  const [lanIp, setLanIp] = useState("...");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch("/api/network")
      .then((res) => res.json())
      .then((data) => setLanIp(data.lanIp || "unknown"))
      .catch(() => setLanIp("unknown"));
  }, []);

  if (currentServer?.type !== "minecraft") {
    return null;
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl p-5">
      <h3 className="text-sm font-bold mb-3">Connection Info</h3>
      <div className="flex gap-4 flex-wrap">
        <button
          onClick={() => copyToClipboard(lanIp, "lan")}
          className="flex items-center gap-2 px-3 py-2 bg-den-surface rounded-lg border border-den-border hover:border-den-border-light transition-colors"
        >
          <span className="text-xs text-den-text-muted">LAN:</span>
          <span className="text-sm font-mono font-medium">{lanIp}</span>
          {copied === "lan" ? <Check size={14} className="text-den-green" /> : <Copy size={14} className="text-den-text-dim" />}
        </button>
      </div>
    </div>
  );
}
