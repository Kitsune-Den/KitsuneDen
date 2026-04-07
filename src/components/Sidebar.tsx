"use client";

import { useServer } from "@/contexts/ServerContext";
import { useState } from "react";
import {
  LayoutDashboard,
  Terminal,
  Server,
  Settings,
  Users,
  Globe,
  HardDrive,
  Package,
  Boxes,
  Crosshair,
  Download,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  section: "overview" | "management";
  requireCapability?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} />, section: "overview" },
  { id: "console", label: "Console", icon: <Terminal size={18} />, section: "overview" },
  { id: "servers", label: "Servers", icon: <Server size={18} />, section: "overview" },
  { id: "config", label: "Configuration", icon: <Settings size={18} />, section: "management" },
  { id: "players", label: "Players", icon: <Users size={18} />, section: "management" },
  { id: "worlds", label: "Worlds", icon: <Globe size={18} />, section: "management", requireCapability: "hasWorlds" },
  { id: "backups", label: "Backups", icon: <HardDrive size={18} />, section: "management", requireCapability: "hasBackups" },
  { id: "mods", label: "Mods", icon: <Package size={18} />, section: "management", requireCapability: "hasMods" },
  { id: "modpacks", label: "Mod Packs", icon: <Boxes size={18} />, section: "management", requireCapability: "hasModPacks" },
  { id: "airdrops", label: "Airdrops", icon: <Crosshair size={18} />, section: "management", requireCapability: "hasKitsuneCommand" },
  { id: "update", label: "Update", icon: <Download size={18} />, section: "management", requireCapability: "hasSteamUpdate||hasLauncherUpdate" },
];

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onSelectDocs?: (docKey: string) => void;
}

export default function Sidebar({ activePage, onNavigate, onSelectDocs }: SidebarProps) {
  const { currentServer } = useServer();
  const caps = currentServer?.capabilities;
  const [docsOpen, setDocsOpen] = useState(false);

  const isVisible = (item: NavItem) => {
    if (!item.requireCapability) return true;
    if (!caps) return false;
    const keys = item.requireCapability.split("||");
    return keys.some((key) => caps[key.trim() as keyof typeof caps] === true);
  };

  const overviewItems = NAV_ITEMS.filter((i) => i.section === "overview" && isVisible(i));
  const managementItems = NAV_ITEMS.filter((i) => i.section === "management" && isVisible(i));

  return (
    <nav className="fixed left-0 top-0 bottom-0 w-[240px] bg-den-base border-r border-den-border flex flex-col z-50 max-[900px]:w-[60px]">
      {/* Header */}
      <div className="px-4 py-5 flex items-center gap-3 border-b border-den-border">
        <div className="text-[28px] leading-none drop-shadow-[0_0_8px_rgba(255,167,38,0.4)]">
          🦊
        </div>
        <div className="max-[900px]:hidden">
          <span className="block text-[16px] font-extrabold bg-gradient-to-r from-den-amber to-[#ff7043] bg-clip-text text-transparent tracking-tight">
            Kitsune Den
          </span>
          <span className="block text-[11px] text-den-text-dim font-medium tracking-wide">
            Server Dashboard
          </span>
        </div>
      </div>

      {/* Overview Section */}
      <div className="px-3 pt-4 pb-2">
        <div className="text-[10px] font-bold text-den-text-dim tracking-widest px-2 pb-2 max-[900px]:hidden">
          OVERVIEW
        </div>
        {overviewItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 max-[900px]:justify-center max-[900px]:px-0 ${
              activePage === item.id
                ? "bg-den-cyan-glow text-den-cyan shadow-[inset_3px_0_0_var(--color-den-cyan)]"
                : "text-den-text-muted hover:bg-den-surface hover:text-den-text"
            }`}
          >
            {item.icon}
            <span className="max-[900px]:hidden">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Management Section */}
      {managementItems.length > 0 && (
        <div className="px-3 pt-2 pb-2">
          <div className="text-[10px] font-bold text-den-text-dim tracking-widest px-2 pb-2 max-[900px]:hidden">
            MANAGEMENT
          </div>
          {managementItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 max-[900px]:justify-center max-[900px]:px-0 ${
                activePage === item.id
                  ? "bg-den-cyan-glow text-den-cyan shadow-[inset_3px_0_0_var(--color-den-cyan)]"
                  : "text-den-text-muted hover:bg-den-surface hover:text-den-text"
              }`}
            >
              {item.icon}
              <span className="max-[900px]:hidden">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto px-4 py-4 border-t border-den-border max-[900px]:hidden">
        <div className="text-[11px] text-den-text-dim font-mono">
          {currentServer ? `${currentServer.name} ${currentServer.version || ""}` : "No server"}
        </div>
        <div className="mt-1 text-[10px] text-den-text-dim opacity-50">
          <span>v{process.env.APP_VERSION || "0.0.0"}</span>
          <span className="mx-1">|</span>
          <a
            href="https://github.com/AdaInTheLab/KitsuneDen"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-den-text transition-colors underline decoration-dotted"
          >
            GitHub
          </a>
        </div>
        <div className="mt-1 text-[9px] text-den-text-dim opacity-40">
          Personal use only. No warranty. Not affiliated with TFP or Valve.
        </div>
        <div className="mt-3">
          <button
            onClick={() => setDocsOpen((prev) => !prev)}
            className="text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md px-2 py-1 hover:bg-den-surface transition-colors"
          >
            [DOCS]
          </button>
          {docsOpen && (
            <div className="mt-2 text-[11px] text-den-text-dim space-y-1">
              <button
                onClick={() => {
                  onSelectDocs?.("readme");
                  onNavigate("docs");
                }}
                className="block text-left hover:text-den-text"
              >
                README
              </button>
              <button
                onClick={() => {
                  onSelectDocs?.("manual/01-spirit-hall");
                  onNavigate("docs");
                }}
                className="block text-left hover:text-den-text"
              >
                Operator Manual
              </button>
              <button
                onClick={() => {
                  onSelectDocs?.("manual/07-appendices");
                  onNavigate("docs");
                }}
                className="block text-left hover:text-den-text"
              >
                Quickstart & Ports
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
