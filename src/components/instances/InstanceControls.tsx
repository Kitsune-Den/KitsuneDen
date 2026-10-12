"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Square, RotateCcw, Loader } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { useServer } from "@/contexts/ServerContext";

type Action = "start" | "stop" | "restart";

/**
 * Sends a lifecycle action. Failures surface through the global toast hook
 * (the response carries success:false), so callers only need the promise.
 */
export async function sendLifecycle(serverId: string, action: Action) {
  const res = await fetch(`/api/server?server=${encodeURIComponent(serverId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
}

/**
 * Tracks one in-flight action per server and clears it once the polled
 * status moves (or after a timeout), so buttons don't spin forever.
 */
export function useLifecycle(serverId: string, status: string | undefined) {
  const { refreshServers } = useServer();
  const [pending, setPending] = useState<{ action: Action; from: string | undefined } | null>(null);

  // The polled status moved, so the action landed: clear it during render
  // rather than in an effect.
  if (pending && status !== pending.from) setPending(null);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 20000);
    return () => clearTimeout(t);
  }, [pending]);

  const run = useCallback(
    async (action: Action) => {
      if (!serverId || pending) return;
      setPending({ action, from: status });
      const result = await sendLifecycle(serverId, action);
      if (result.success === false) setPending(null);
      refreshServers();
    },
    [serverId, status, pending, refreshServers]
  );

  return { pending: pending?.action ?? null, run };
}

interface InstanceControlsProps {
  serverId: string;
  serverName: string;
  status: string | undefined;
  /** "s" / "r" / "x" shortcuts land here so they get the same confirmations */
  requestRef?: (fn: (a: Action) => void) => void;
}

/** Start / Stop / Restart with a confirmation before anything that kicks players. */
export default function InstanceControls({ serverId, serverName, status, requestRef }: InstanceControlsProps) {
  const { pending, run } = useLifecycle(serverId, status);
  const [confirm, setConfirm] = useState<Action | null>(null);

  const isRunning = status === "running";
  const isStopped = status === "stopped" || !status;
  const busy = !!pending || status === "starting" || status === "stopping";

  const request = useCallback(
    (a: Action) => {
      if (busy) return;
      if (a === "start" && !isStopped) return;
      if (a !== "start" && !isRunning) return;
      if (a === "start") run("start");
      else setConfirm(a);
    },
    [busy, isStopped, isRunning, run]
  );

  useEffect(() => {
    requestRef?.(request);
  }, [requestRef, request]);

  const spin = (a: Action) => (pending === a ? <Loader size={14} className="animate-spin" /> : null);

  return (
    <>
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => request("start")} disabled={busy || !isStopped} title="Start (s)">
          {spin("start") || <Play size={14} />} Start
        </button>
        <button className="btn btn-danger" onClick={() => request("stop")} disabled={busy || !isRunning} title="Stop (x)">
          {spin("stop") || <Square size={14} />} Stop
        </button>
        <button className="btn" onClick={() => request("restart")} disabled={busy || !isRunning} title="Restart (r)">
          {spin("restart") || <RotateCcw size={14} />} Restart
        </button>
      </div>
      <ConfirmModal
        open={confirm !== null}
        title={confirm === "stop" ? `Stop ${serverName}?` : `Restart ${serverName}?`}
        confirmLabel={confirm === "stop" ? "Stop server" : "Restart server"}
        confirmDestructive={confirm === "stop"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const a = confirm;
          setConfirm(null);
          if (a) run(a);
        }}
      >
        Anyone playing will be disconnected.
        {confirm === "restart" ? " The server comes back up on its own." : " It stays off until someone starts it again."}
      </ConfirmModal>
    </>
  );
}
