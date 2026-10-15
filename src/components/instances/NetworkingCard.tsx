"use client";

import Link from "next/link";
import { Globe2, Lock, TriangleAlert } from "lucide-react";
import { useServer } from "@/contexts/ServerContext";
import { gameMeta } from "@/lib/game-meta";
import { recipeFor } from "@/lib/recipes";
import {
  PROTO_LABEL,
  PURPOSE_LABEL,
  hostKey,
  portClashes,
  serverPorts,
  type ServerPort,
} from "@/lib/networking";

const SOURCE_LABEL: Record<ServerPort["source"], string> = {
  set: "set in server setup",
  default: "game default",
  offset: "",
};

function describe(p: ServerPort): string {
  return `${PROTO_LABEL[p.proto]} ${p.port}`;
}

/**
 * The ports the current server uses, which ones players need forwarded, and
 * any that collide with another server on the same machine. Port facts come
 * from the game's recipe; numbers from servers.json where set.
 */
export default function NetworkingCard() {
  const { currentServer, servers } = useServer();
  if (!currentServer) return null;
  const recipe = recipeFor(currentServer.type);
  const ports = serverPorts(currentServer);
  if (!recipe || ports.length === 0) return null;

  const clashes = portClashes(currentServer.id, servers);
  const clashFor = (p: ServerPort) => clashes.find((c) => c.port.field === p.field);
  const host = hostKey(currentServer);
  // Name the game too: several servers in one Den can share a display name.
  const owner = (o: ServerPort) => {
    if (o.serverId === currentServer.id) return "this server";
    const type = servers.find((s) => s.id === o.serverId)?.type;
    return `${o.serverName} (${gameMeta(type).label})`;
  };

  return (
    <section className="den-card overflow-hidden">
      <div className="den-card-header">
        <h3 className="den-card-title">Networking</h3>
        {clashes.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border text-den-red border-den-red/40 bg-den-red/10">
            <TriangleAlert size={12} aria-hidden="true" />
            {clashes.length === 1 ? "1 port clash" : `${clashes.length} port clashes`}
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-den-surface text-den-text-muted border border-den-border">
            {ports.length === 1 ? "1 port" : `${ports.length} ports`}
            {host !== "local" && <span className="font-mono ml-1.5">on {host}</span>}
          </span>
        )}
      </div>

      {clashes.length > 0 && (
        <div className="mx-5 mt-4 px-4 py-3 rounded-lg border border-den-red/30 bg-den-red/10 text-[13px] space-y-1.5" role="alert">
          {clashes.map((c) => (
            <div key={c.port.field} className="flex gap-2">
              <TriangleAlert size={15} className="text-den-red shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <span className="font-semibold">{describe(c.port)}</span> ({PURPOSE_LABEL[c.port.purpose]}) is also{" "}
                used by {c.with.map((o) => `${owner(o)} for ${PURPOSE_LABEL[o.purpose]}`).join(", ")}. Only one
                can bind it at a time.
              </span>
            </div>
          ))}
          <div className="text-[12px] text-den-text-muted pl-[23px]">
            Move one of them in{" "}
            <Link href="/manage" className="text-den-cyan hover:text-den-text underline-offset-2 hover:underline">
              Server setup
            </Link>
            , and in the game&apos;s own config if it sets the port there too.
          </div>
        </div>
      )}

      <ul className="px-5 py-2">
        {ports.map((p) => {
          const clash = clashFor(p);
          const source = p.source === "offset" ? p.offsetLabel : SOURCE_LABEL[p.source];
          return (
            <li key={p.field} className="den-row flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`font-mono tabular-nums text-[14px] font-semibold ${clash ? "text-den-red" : "text-den-text"}`}
                >
                  {p.port}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold tracking-wide bg-den-bg/60 border border-den-border text-den-text-muted">
                  {PROTO_LABEL[p.proto]}
                </span>
                <span className="text-[13px] text-den-text">{PURPOSE_LABEL[p.purpose]}</span>
                {clash && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-den-red">
                    <TriangleAlert size={12} aria-hidden="true" />
                    Clash
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 ml-auto">
                {source && <span className="text-[11px] text-den-text-dim">{source}</span>}
                {p.public ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-den-cyan" title="Players need this port forwarded">
                    <Globe2 size={13} aria-hidden="true" />
                    Forward
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-den-text-muted" title="Control port: keep it off the internet">
                    <Lock size={13} aria-hidden="true" />
                    Keep private
                  </span>
                )}
              </div>
              {p.note && <div className="basis-full text-[11.5px] text-den-text-dim -mt-0.5">{p.note}</div>}
            </li>
          );
        })}
      </ul>

      <div className="px-5 pb-4 pt-1 text-[12.5px] text-den-text-muted">
        <span className="den-eyebrow mr-2">How players join</span>
        {recipe.connect}
      </div>
    </section>
  );
}
