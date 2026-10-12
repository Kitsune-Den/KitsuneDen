"use client";

import { useServer } from "@/contexts/ServerContext";
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
  BookOpen,
  ScrollText,
  Compass,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  section: "overview" | "management";
  requireCapability?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} />, section: "overview" },
  { id: "console", label: "Console", icon: <Terminal size={17} />, section: "overview" },
  { id: "servers", label: "Servers", icon: <Server size={17} />, section: "overview" },
  { id: "config", label: "Configuration", icon: <Settings size={17} />, section: "management" },
  { id: "players", label: "Players", icon: <Users size={17} />, section: "management" },
  { id: "worlds", label: "Worlds", icon: <Globe size={17} />, section: "management", requireCapability: "hasWorlds" },
  { id: "backups", label: "Backups", icon: <HardDrive size={17} />, section: "management", requireCapability: "hasBackups" },
  { id: "mods", label: "Mods", icon: <Package size={17} />, section: "management", requireCapability: "hasMods" },
  { id: "modpacks", label: "Mod Packs", icon: <Boxes size={17} />, section: "management", requireCapability: "hasModPacks" },
  { id: "airdrops", label: "Airdrops", icon: <Crosshair size={17} />, section: "management", requireCapability: "hasKitsuneCommand" },
  { id: "update", label: "Update", icon: <Download size={17} />, section: "management", requireCapability: "hasSteamUpdate||hasLauncherUpdate" },
];

const DOC_LINKS = [
  { key: "readme", label: "README", icon: <BookOpen size={17} /> },
  { key: "manual/01-spirit-hall", label: "Operator's Manual", icon: <ScrollText size={17} /> },
  { key: "manual/07-appendices", label: "Quickstart & Ports", icon: <Compass size={17} /> },
];

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onSelectDocs?: (docKey: string) => void;
  activeDoc?: string;
}

function NavButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-current={active ? "page" : undefined}
      className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors mb-0.5 max-[900px]:justify-center max-[900px]:px-0 ${
        active
          ? "bg-den-card text-den-text"
          : "text-den-text-muted hover:bg-den-surface hover:text-den-text"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-den-cyan max-[900px]:hidden" />
      )}
      <span className={active ? "text-den-cyan" : ""}>{icon}</span>
      <span className="max-[900px]:hidden">{label}</span>
    </button>
  );
}

export default function Sidebar({ activePage, onNavigate, onSelectDocs, activeDoc }: SidebarProps) {
  const { currentServer } = useServer();
  const caps = currentServer?.capabilities;

  const isVisible = (item: NavItem) => {
    if (!item.requireCapability) return true;
    if (!caps) return false;
    const keys = item.requireCapability.split("||");
    return keys.some((key) => caps[key.trim() as keyof typeof caps] === true);
  };

  const sections: { title: string; items: NavItem[] }[] = [
    { title: "Overview", items: NAV_ITEMS.filter((i) => i.section === "overview" && isVisible(i)) },
    { title: "Manage", items: NAV_ITEMS.filter((i) => i.section === "management" && isVisible(i)) },
  ];

  return (
    <nav className="fixed left-0 top-0 bottom-0 w-[240px] bg-den-base border-r border-den-border flex flex-col z-50 max-[900px]:w-[60px]">
      {/* Brand */}
      <div className="h-16 min-h-16 px-4 flex items-center gap-3 border-b border-den-border max-[900px]:justify-center max-[900px]:px-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[20px] leading-none bg-gradient-to-br from-den-lantern/25 to-den-lantern/5 border border-den-lantern/30 shadow-[0_0_18px_-4px_var(--color-den-lantern)]">
          🦊
        </div>
        <div className="max-[900px]:hidden">
          <span className="block text-[15px] font-bold tracking-tight text-den-text">
            Kitsune<span className="text-den-lantern">Den</span>
          </span>
          <span className="block text-[11px] text-den-text-dim">Game server dashboard</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sections.map(
          (section) =>
            section.items.length > 0 && (
              <div key={section.title} className="px-3 pt-5">
                <div className="den-eyebrow px-3 pb-2 max-[900px]:hidden">{section.title}</div>
                {section.items.map((item) => (
                  <NavButton
                    key={item.id}
                    active={activePage === item.id}
                    onClick={() => onNavigate(item.id)}
                    icon={item.icon}
                    label={item.label}
                  />
                ))}
              </div>
            )
        )}

        <div className="px-3 pt-5 pb-4">
          <div className="den-eyebrow px-3 pb-2 max-[900px]:hidden">Library</div>
          {DOC_LINKS.map((doc) => (
            <NavButton
              key={doc.key}
              active={activePage === "docs" && activeDoc === doc.key}
              onClick={() => onSelectDocs?.(doc.key)}
              icon={doc.icon}
              label={doc.label}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-den-border max-[900px]:hidden">
        <div className="flex items-center justify-between text-[11px] text-den-text-dim">
          <span className="font-mono">v{process.env.APP_VERSION || "0.0.0"}</span>
          <a
            href="https://github.com/Kitsune-Den/KitsuneDen"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-den-text transition-colors"
          >
            GitHub ↗
          </a>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-den-text-dim/70">
          Personal use only. No warranty. Not affiliated with any game publisher.
        </p>
      </div>
    </nav>
  );
}
