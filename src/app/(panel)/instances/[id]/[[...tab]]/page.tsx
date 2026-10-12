"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import {
  ArrowLeft,
  Gauge,
  Terminal,
  Settings,
  Users,
  Globe,
  HardDrive,
  Package,
  Boxes,
  Crosshair,
  Download,
  Activity as ActivityIcon,
} from "lucide-react";
import Page from "@/components/shell/Page";
import { useServer, type ServerInfo } from "@/contexts/ServerContext";
import { gameMeta, statusMeta } from "@/lib/game-meta";
import { useHotkeys } from "@/lib/useHotkeys";
import { confirmDiscard } from "@/lib/unsaved";
import InstanceControls from "@/components/instances/InstanceControls";
import { GameIconGlyph } from "@/components/instances/GameArt";
import DashboardPage from "@/components/DashboardPage";
import ConsolePage from "@/components/ConsolePage";
import ConfigEditor from "@/components/ConfigEditor";
import PlayerManager from "@/components/PlayerManager";
import WorldViewer from "@/components/hytale/WorldViewer";
import BackupManager from "@/components/hytale/BackupManager";
import ModsPage from "@/components/ModsPage";
import ModPacks from "@/components/minecraft/ModPacks";
import AirdropManager from "@/components/hytale/AirdropManager";
import PalworldUpdateManager from "@/components/palworld/UpdateManager";
import HytaleUpdateManager from "@/components/hytale/UpdateManager";
import EnshroudedUpdateManager from "@/components/enshrouded/UpdateManager";
import ActivityFeed from "@/components/ActivityFeed";

type Caps = ServerInfo["capabilities"];

interface TabDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  visible?: (caps: Caps) => boolean;
}

const TABS: TabDef[] = [
  { id: "status", label: "Status", icon: <Gauge size={15} /> },
  { id: "console", label: "Console", icon: <Terminal size={15} /> },
  { id: "config", label: "Config", icon: <Settings size={15} /> },
  { id: "players", label: "Players", icon: <Users size={15} /> },
  { id: "worlds", label: "Worlds", icon: <Globe size={15} />, visible: (c) => c.hasWorlds },
  { id: "backups", label: "Backups", icon: <HardDrive size={15} />, visible: (c) => c.hasBackups },
  { id: "mods", label: "Mods", icon: <Package size={15} />, visible: (c) => c.hasMods },
  { id: "modpacks", label: "Mod packs", icon: <Boxes size={15} />, visible: (c) => c.hasModPacks },
  { id: "airdrops", label: "Airdrops", icon: <Crosshair size={15} />, visible: (c) => c.hasKitsuneCommand },
  { id: "update", label: "Update", icon: <Download size={15} />, visible: (c) => c.hasSteamUpdate || c.hasLauncherUpdate },
  { id: "activity", label: "Activity", icon: <ActivityIcon size={15} /> },
];

function TabBody({ tab, server, go }: { tab: string; server: ServerInfo; go: (t: string) => void }) {
  switch (tab) {
    case "console":
      return <ConsolePage />;
    case "config":
      return <ConfigEditor />;
    case "players":
      return <PlayerManager />;
    case "worlds":
      return <WorldViewer />;
    case "backups":
      return <BackupManager />;
    case "mods":
      return <ModsPage />;
    case "modpacks":
      return <ModPacks />;
    case "airdrops":
      return <AirdropManager />;
    case "update":
      if (server.type === "hytale") return <HytaleUpdateManager />;
      if (server.type === "enshrouded") return <EnshroudedUpdateManager />;
      return <PalworldUpdateManager />;
    case "activity":
      return <ActivityFeed serverId={server.id} />;
    default:
      return <DashboardPage onNavigate={go} />;
  }
}

export default function InstancePage() {
  const params = useParams<{ id: string; tab?: string[] }>();
  const router = useRouter();
  const { servers, loaded } = useServer();
  const id = decodeURIComponent(params.id);
  const server = servers.find((s) => s.id === id) || null;

  const tabs = server ? TABS.filter((t) => !t.visible || t.visible(server.capabilities)) : TABS.slice(0, 1);
  const requested = params.tab?.[0] ?? "status";
  const active = tabs.some((t) => t.id === requested) ? requested : "status";
  const base = `/instances/${encodeURIComponent(id)}`;

  const go = useCallback(
    (t: string) => {
      if (!confirmDiscard()) return;
      router.push(t === "status" ? base : `${base}/${t}`);
    },
    [router, base]
  );

  const controlsRef = useRef<((a: "start" | "stop" | "restart") => void) | null>(null);
  const setControls = useCallback((fn: (a: "start" | "stop" | "restart") => void) => {
    controlsRef.current = fn;
  }, []);

  const idx = tabs.findIndex((t) => t.id === active);
  useHotkeys(
    {
      s: () => controlsRef.current?.("start"),
      r: () => controlsRef.current?.("restart"),
      x: () => controlsRef.current?.("stop"),
      "[": () => go(tabs[(idx - 1 + tabs.length) % tabs.length].id),
      "]": () => go(tabs[(idx + 1) % tabs.length].id),
    },
    !!server
  );

  if (loaded && !server) {
    return (
      <Page title="Server not found">
        <div className="den-card px-5 py-14 text-center">
          <p className="text-den-text-muted mb-4">
            There&apos;s no server called <code className="font-mono text-den-text">{id}</code> in the Den.
          </p>
          <Link href="/" className="btn">
            <ArrowLeft size={14} /> All servers
          </Link>
        </div>
      </Page>
    );
  }

  const status = statusMeta(server?.status);
  const game = gameMeta(server?.type);

  return (
    <Page
      title={
        <>
          <Link
            href="/"
            className="icon-btn -ml-1.5"
            aria-label="All servers"
            title="All servers (h)"
            onClick={(e) => {
              if (!confirmDiscard()) e.preventDefault();
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          {server ? <span className="truncate">{server.name}</span> : <span className="skel inline-block w-40 h-5" />}
          {server && (
            <span className="badge badge-tone" style={{ ["--tone" as string]: status.tone }}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          )}
        </>
      }
      subtitle={
        server && (
          <span className="inline-flex items-center gap-1.5">
            <GameIconGlyph type={server.type} size={13} />
            {game.label}
            {server.loader ? ` · ${server.loader}` : ""}
            {server.version ? ` ${server.version}` : ""}
            {server.gamePort ? ` · port ${server.gamePort}` : ""}
          </span>
        )
      }
      actions={
        server && (
          <InstanceControls serverId={server.id} serverName={server.name} status={server.status} requestRef={setControls} />
        )
      }
      below={
        <div className="tabs -mb-px" role="tablist" aria-label="Server sections">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.id === "status" ? base : `${base}/${t.id}`}
              role="tab"
              aria-selected={t.id === active}
              className="tab"
              onClick={(e) => {
                if (!confirmDiscard()) e.preventDefault();
              }}
            >
              <span aria-hidden className="opacity-80">
                {t.icon}
              </span>
              {t.label}
            </Link>
          ))}
        </div>
      }
    >
      {server ? (
        <div key={active}>
          <TabBody tab={active} server={server} go={go} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skel h-[84px] !rounded-[14px]" />
            ))}
          </div>
          <div className="skel h-[320px] !rounded-[14px]" />
        </div>
      )}
    </Page>
  );
}
