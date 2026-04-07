"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useRef, useState, useCallback } from "react";

export default function ConsolePage() {
  const { serverId } = useServer();
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connectSSE = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLines([]);

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
    const cleanup = connectSSE();
    return cleanup;
  }, [connectSSE]);

  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const sendCommand = async () => {
    if (!command.trim()) return;
    try {
      await fetch(`/api/server?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "command", command: command.trim() }),
      });
      setHistory((prev) => [command.trim(), ...prev.slice(0, 49)]);
      setCommand("");
      setHistoryIdx(-1);
    } catch {
      // ignore
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
    if (line.includes("SEVERE") || line.includes("ERROR")) return "text-den-red font-semibold";
    if (line.includes("WARN")) return "text-den-amber";
    return "";
  };

  return (
    <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden h-[calc(100vh-200px)]">
      <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
        <h3 className="text-sm font-bold">Live Console</h3>
        <div className="flex items-center gap-3">
          <label className="text-xs text-den-text-muted flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-den-cyan"
            />
            Auto-scroll
          </label>
          <button
            onClick={() => setLines([])}
            className="px-3 py-1 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface hover:text-den-text transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Console Output */}
      <div
        ref={outputRef}
        className="h-[calc(100%-110px)] overflow-y-auto px-4 py-3 font-mono text-xs leading-7 bg-den-bg text-den-text-muted"
      >
        {lines.map((line, i) => (
          <div key={i} className={`whitespace-pre-wrap break-all ${getLineClass(line)}`}>
            {line}
          </div>
        ))}
      </div>

      {/* Command Input */}
      <div className="h-[46px] border-t border-den-border flex items-center px-4 bg-den-base">
        <span className="text-den-cyan font-mono text-sm mr-2">&gt;</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          className="flex-1 bg-transparent text-den-text font-mono text-sm outline-none placeholder:text-den-text-dim"
        />
      </div>
    </div>
  );
}
