"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

interface ServerInfo {
  id: string;
  name: string;
  type: "minecraft" | "hytale" | "7d2d" | "palworld" | "enshrouded";
  status: string;
  loader?: string;
  version?: string;
  gamePort?: number;
  /** Set for Minecraft servers that live on another host. */
  rconHost?: string;
  /** Secret fields that are set server-side. Values are never sent to the browser. */
  secretsSet?: string[];
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
  /** The server in focus: the one in the URL on /instances/[id], else the last one visited */
  serverId: string;
  /** Opens a server's page */
  setServerId: (id: string) => void;
  servers: ServerInfo[];
  currentServer: ServerInfo | null;
  refreshServers: () => void;
  /** False until the first /api/servers response, so pages can show skeletons */
  loaded: boolean;
}

const ServerContext = createContext<ServerContextType>({
  serverId: "",
  setServerId: () => {},
  servers: [],
  currentServer: null,
  refreshServers: () => {},
  loaded: false,
});

export type { ServerInfo };

export function ServerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const routeMatch = pathname?.match(/^\/instances\/([^/]+)/);
  const routeId = routeMatch ? decodeURIComponent(routeMatch[1]) : null;

  const [lastId, setLastId] = useState("");
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Remember the last server route so pages outside /instances/[id] keep
  // their focus. Adjusted during render, not in an effect.
  if (routeId && routeId !== lastId) setLastId(routeId);

  const serverId = routeId ?? lastId;

  const fetchServers = useCallback(() => {
    fetch("/api/servers")
      .then((res) => res.json())
      .then((data) => {
        const list: ServerInfo[] = data.servers || [];
        setServers((prev) => {
          const next = JSON.stringify(list);
          return JSON.stringify(prev) === next ? prev : list;
        });
        setLoaded(true);
        // Keep a sensible fallback focus for pages outside /instances/[id]
        if (list.length > 0) {
          setLastId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0].id));
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

  const setServerId = useCallback(
    (id: string) => {
      setLastId(id);
      router.push(`/instances/${encodeURIComponent(id)}`);
    },
    [router]
  );

  return (
    <ServerContext.Provider value={{ serverId, setServerId, servers, currentServer, refreshServers: fetchServers, loaded }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  return useContext(ServerContext);
}
