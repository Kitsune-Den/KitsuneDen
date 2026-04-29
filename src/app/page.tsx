"use client";

import { useState } from "react";
import { ServerProvider, useServer } from "@/contexts/ServerContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ServerSwitcher from "@/components/ServerSwitcher";
import Particles from "@/components/Particles";
import DashboardPage from "@/components/DashboardPage";
import ConsolePage from "@/components/ConsolePage";
import ServerControl from "@/components/ServerControl";
import ConfigEditor from "@/components/ConfigEditor";
import PlayerManager from "@/components/PlayerManager";
import WorldViewer from "@/components/hytale/WorldViewer";
import BackupManager from "@/components/hytale/BackupManager";
import ModsPage from "@/components/ModsPage";
import ModPacks from "@/components/minecraft/ModPacks";
import AirdropManager from "@/components/hytale/AirdropManager";
import DocsPage from "@/components/DocsPage";
import PalworldUpdateManager from "@/components/palworld/UpdateManager";
import HytaleUpdateManager from "@/components/hytale/UpdateManager";
import EnshroudedUpdateManager from "@/components/enshrouded/UpdateManager";
import ServersPage from "@/components/ServersPage";

function UpdatePage() {
  const { currentServer } = useServer();
  if (currentServer?.type === "hytale") return <HytaleUpdateManager />;
  if (currentServer?.type === "enshrouded") return <EnshroudedUpdateManager />;
  return <PalworldUpdateManager />;
}

export default function Home() {
  const [activePage, setActivePage] = useState("dashboard");
  const [docsKey, setDocsKey] = useState("readme");

  return (
    <ServerProvider>
      <Particles />
      <div className="flex min-h-screen">
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
          onSelectDocs={(key) => {
            setDocsKey(key);
            setActivePage("docs");
          }}
        />
        <main className="ml-[240px] max-[900px]:ml-[60px] flex-1 flex flex-col min-h-screen relative z-[1]">
          <Topbar activePage={activePage} />

          {/* Server Switcher Bar */}
          <div className="px-6 py-3 bg-den-base/50 border-b border-den-border">
            <ServerSwitcher />
          </div>

          {/* Page Content */}
          <div
            className="flex-1 overflow-y-auto p-6"
            style={{ background: "linear-gradient(135deg, #0d1b2a 0%, #1b2838 40%, #1a2040 100%)" }}
          >
            <div className="animate-[pageIn_0.2s_ease-out]" key={activePage}>
              {activePage === "dashboard" && <DashboardPage />}
              {activePage === "console" && <ConsolePage />}
              {activePage === "servers" && <ServersPage />}
              {activePage === "config" && <ConfigEditor />}
              {activePage === "players" && <PlayerManager />}
              {activePage === "worlds" && <WorldViewer />}
              {activePage === "backups" && <BackupManager />}
              {activePage === "mods" && <ModsPage />}
              {activePage === "modpacks" && <ModPacks />}
              {activePage === "airdrops" && <AirdropManager />}
              {activePage === "update" && <UpdatePage />}
              {activePage === "docs" && <DocsPage docKey={docsKey} onSelect={setDocsKey} />}
            </div>
          </div>
        </main>
      </div>

      {/* Server Control floating panel - shown on dashboard */}
      {activePage === "dashboard" && (
        <div className="fixed bottom-6 right-6 z-50">
          <ServerControl compact />
        </div>
      )}
    </ServerProvider>
  );
}
