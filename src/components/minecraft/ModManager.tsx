"use client";

import { useServer } from "@/contexts/ServerContext";
import { Package } from "lucide-react";

export default function ModManager() {
  const { currentServer } = useServer();

  if (currentServer?.type !== "minecraft") {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-den-border flex items-center gap-2">
        <Package size={16} className="text-den-cyan" />
        <h3 className="text-sm font-bold">Mod Manager</h3>
      </div>
      <div className="p-5">
        <div className="text-center py-10 text-den-text-dim text-[13px]">
          Mod management coming soon. Use the server&apos;s mods/ directory directly for now.
        </div>
      </div>
    </div>
  );
}
