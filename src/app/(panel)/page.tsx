"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import Page from "@/components/shell/Page";
import InstanceGrid, { ViewToggle, useViewMode } from "@/components/instances/InstanceGrid";
import { useServer } from "@/contexts/ServerContext";

export default function ServersHome() {
  const { servers, loaded } = useServer();
  const [view, setView] = useViewMode();
  const online = servers.filter((s) => s.status === "running").length;

  return (
    <Page
      title={
        <>
          Servers
          <Link href="/manage" className="btn btn-primary btn-sm ml-1">
            <Plus size={14} /> Add
          </Link>
        </>
      }
      subtitle={
        loaded ? (
          <>
            {servers.length} {servers.length === 1 ? "server" : "servers"} · {online} online
            <span className="inline-flex items-center gap-1.5 ml-2 text-den-green">
              <span className="w-1.5 h-1.5 rounded-full bg-den-green animate-[pulse_2.4s_ease-in-out_infinite]" />
              live
            </span>
          </>
        ) : (
          "Checking on the Den…"
        )
      }
      actions={<ViewToggle view={view} onChange={setView} />}
    >
      <InstanceGrid view={view} />
    </Page>
  );
}
