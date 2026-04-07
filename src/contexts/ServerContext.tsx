"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

interface ServerInfo {
  id: string;
  name: string;
  type: "minecraft" | "hytale" | "7d2d" | "palworld";
  status: string;
  loader?: string;
  version?: string;
  gamePort?: number;
  capabilities: {
    hasRcon: boolean;
    hasMods: boolean;
    hasModPacks: boolean;
    hasBackups: boolean;
    hasWorlds: boolean;
    hasWarps: boolean;
    hasServerProperties: boolean;
    hasJsonConfig: boolean;
    hasKitsuneCommand: boolean;
    hasRestApi: boolean;
    hasSteamUpdate: boolean;
    hasLauncherUpdate: boolean;
  };
}

interface ServerContextType {
  serverId: string;
  setServerId: (id: string) => void;
  servers: ServerInfo[];
  currentServer: ServerInfo | null;
  refreshServers: () => void;
}

const ServerContext = createContext<ServerContextType>({
  serverId: "",
  setServerId: () => {},
  servers: [],
  currentServer: null,
  refreshServers: () => {},
});

export function ServerProvider({ children }: { children: ReactNode }) {
  const [serverId, setServerId] = useState("");
  const [servers, setServers] = useState<ServerInfo[]>([]);

  const fetchServers = useCallback(() => {
    fetch("/api/servers")
      .then((res) => res.json())
      .then((data) => {
        const list: ServerInfo[] = data.servers || [];
        setServers((prev) => {
          const next = JSON.stringify(list);
          return JSON.stringify(prev) === next ? prev : list;
        });
        // Auto-select first server if none selected
        if (list.length > 0) {
          setServerId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0].id));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 5000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  const currentServer = servers.find((s) => s.id === serverId) || null;

  return (
    <ServerContext.Provider value={{ serverId, setServerId, servers, currentServer, refreshServers: fetchServers }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  return useContext(ServerContext);
}
