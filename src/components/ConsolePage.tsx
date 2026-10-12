"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

// Panel-only echo lines, mixed into the log stream with a marker prefix so
// they keep their place in order. They never touch the server's log file.
const ECHO_CMD = "\u0001";
const ECHO_OK = "\u0002";
const ECHO_ERR = "\u0003";
const historyKey = (id: string) => `kitsuneden-console-history:${id}`;

function loadHistory(id: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(historyKey(id)) || "[]");
  } catch {
    return [];
  }
}

export default function ConsolePage() {
  const { serverId } = useServer();
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>(() => loadHistory(serverId));
  const [sending, setSending] = useState(false);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);

  // Switching servers starts a fresh console with that server's command
  // history. Reset during render rather than in an effect so the old server's
  // lines never paint under the new one.
  const [linesServerId, setLinesServerId] = useState(serverId);
  if (linesServerId !== serverId) {
    setLinesServerId(serverId);
    setLines([]);
    setHistory(loadHistory(serverId));
    setHistoryIdx(-1);
  }

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/console?server=${serverId}`, {
      method: "POST",
      signal: controller.signal,
    })
      .then((response) => {
        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        function read() {
          reader!.read().then(({ done, value }) => {
            if (done) return;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (const part of parts) {
              if (part.startsWith("data: ")) {
                try {
                  const data = JSON.parse(part.substring(6));
                  if (data.line) {
                    setLines((prev) => {
                      const next = [...prev, data.line];
                      return next.length > 2000 ? next.slice(-2000) : next;
                    });
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }
            read();
          }).catch(() => {
            // Stream aborted on cleanup — expected
          });
        }
        read();
      })
      .catch(() => {
        // Connection closed or aborted
      });

    return () => controller.abort();
  }, [serverId]);

  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const sendCommand = async () => {
    const cmd = command.trim();
    if (!cmd || sending) return;
    setSending(true);
    setCommand("");
    setHistoryIdx(-1);
    setHistory((prev) => {
      const next = [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 50);
      try {
        sessionStorage.setItem(historyKey(serverId), JSON.stringify(next));
      } catch {}
      return next;
    });
    setLines((prev) => [...prev, ECHO_CMD + cmd]);
    try {
      const res = await fetch(`/api/server?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "command", command: cmd }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      const ok = res.ok && data.success !== false;
      const msg = data.message || (ok ? "sent" : `failed (${res.status})`);
      setLines((prev) => [...prev, (ok ? ECHO_OK : ECHO_ERR) + msg]);
    } catch (e) {
      setLines((prev) => [...prev, ECHO_ERR + (e instanceof Error ? e.message : "network error")]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      sendCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const next = Math.min(historyIdx + 1, history.length - 1);
        setHistoryIdx(next);
        setCommand(history[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx > 0) {
        const next = historyIdx - 1;
        setHistoryIdx(next);
        setCommand(history[next]);
      } else {
        setHistoryIdx(-1);
        setCommand("");
      }
    }
  };

  const getLineClass = (line: string) => {
    if (line.includes("SEVERE") || line.includes("ERROR") || line.includes(" ERR ")) return "text-[#f08a80]";
    if (line.includes("WARN") || line.includes(" WRN ")) return "text-[#e8c568]";
    return "";
  };

  const renderLine = (line: string, i: number) => {
    const marker = line[0];
    if (marker === ECHO_CMD)
      return (
        <div key={i} className="whitespace-pre-wrap break-all text-den-accent font-semibold">
          ❯ {line.slice(1)}
        </div>
      );
    if (marker === ECHO_OK)
      return (
        <div key={i} className="whitespace-pre-wrap break-all text-[#9ce0b8] pl-4">
          {line.slice(1)}
        </div>
      );
    if (marker === ECHO_ERR)
      return (
        <div key={i} className="whitespace-pre-wrap break-all text-[#f08a80] pl-4">
          ! {line.slice(1)}
        </div>
      );
    return (
      <div key={i} className={`whitespace-pre-wrap break-all ${getLineClass(line)}`}>
        {line}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-[12.5px] text-den-text-muted">
        <span>Live log. Commands you send show up inline, marked with ❯.</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Follow
          </label>
          <button onClick={() => setLines([])} className="btn btn-sm btn-ghost">
            Clear
          </button>
        </div>
      </div>

      <div
        className="rounded-[14px] border border-den-border overflow-hidden flex flex-col h-[calc(100vh-260px)] min-h-[360px]"
        style={{ background: "var(--console-bg)", color: "var(--console-text)" }}
      >
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-6"
          role="log"
          aria-live="off"
        >
          {lines.length === 0 ? (
            <div className="text-white/35 font-sans text-[13px] py-6 text-center">Waiting for log output…</div>
          ) : (
            lines.map(renderLine)
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
          <span className="text-den-accent font-mono text-[14px] pl-1" aria-hidden>
            ❯
          </span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command and press Enter…"
            aria-label="Console command"
            className="flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-white/30"
          />
          <button
            onClick={sendCommand}
            disabled={!command.trim() || sending}
            className="btn btn-sm btn-primary"
            aria-label="Send command"
          >
            <SendHorizontal size={13} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
