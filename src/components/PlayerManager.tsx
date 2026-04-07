"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useState, useCallback } from "react";

interface Player {
  uuid: string;
  name: string | null;
  groups: string[];
  isOp: boolean;
}

interface PlayerResponse {
  players: Player[];
  whitelist: unknown;
  bans: unknown;
  userCache?: unknown;
}

interface McEntry {
  uuid?: string;
  name?: string;
  [key: string]: unknown;
}

interface AdminUser {
  platform: string;
  userId: string;
  name: string;
  permissionLevel: number;
}

interface AdminWhitelistEntry {
  platform: string;
  userId: string;
  name: string;
}

interface AdminBlacklistEntry {
  platform: string;
  userId: string;
  name: string;
  unbanDate: string;
  reason: string;
}

interface AdminCommand {
  cmd: string;
  permissionLevel: number;
}

interface AdminData {
  users: AdminUser[];
  whitelist: AdminWhitelistEntry[];
  blacklist: AdminBlacklistEntry[];
  commands: AdminCommand[];
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export default function PlayerManager() {
  const { serverId, currentServer } = useServer();
  const [data, setData] = useState<PlayerResponse | null>(null);
  const [message, setMessage] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [uuidInput, setUuidInput] = useState("");
  const [addWhitelist, setAddWhitelist] = useState(true);
  const [addOp, setAddOp] = useState(false);
  const [addBan, setAddBan] = useState(false);
  const [busyAction, setBusyAction] = useState("");

  // Palworld admin state
  const [pwAdmins, setPwAdmins] = useState<string[]>([]);
  const [pwAdminPassword, setPwAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // 7D2D admin state
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [adminSteamId, setAdminSteamId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPermLevel, setAdminPermLevel] = useState("0");
  const [wlSteamId, setWlSteamId] = useState("");
  const [wlName, setWlName] = useState("");
  const [blSteamId, setBlSteamId] = useState("");
  const [blName, setBlName] = useState("");
  const [blReason, setBlReason] = useState("");
  const [cmdName, setCmdName] = useState("");
  const [cmdPermLevel, setCmdPermLevel] = useState("0");

  const loadPlayers = useCallback(async () => {
    try {
      const res = await fetch(`/api/players?server=${serverId}`);
      const json = await res.json();
      setData(json);
      if (json.admins) setPwAdmins(json.admins);
      if (json.adminPassword !== undefined) setPwAdminPassword(json.adminPassword);
      if (json.adminData) {
        setAdminData(json.adminData);
      }
    } catch {
      setMessage("Failed to load players");
    }
  }, [serverId]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const toggleOp = async (uuid: string, currentlyOp: boolean) => {
    const action = currentlyOp ? "Remove OP from" : "Grant OP to";
    if (!confirm(`${action} this player?`)) return;

    try {
      const res = await fetch(`/api/players?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-op", uuid, op: !currentlyOp }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage(currentlyOp ? "OP removed" : "OP granted! Restart server for changes to take effect.");
        loadPlayers();
      } else {
        setMessage(`Failed: ${result.error}`);
      }
    } catch {
      setMessage("Failed to toggle OP");
    }
  };

  const players = data?.players || [];
  const isHytale = currentServer?.type === "hytale";
  const isMinecraft = currentServer?.type === "minecraft";
  const is7d2d = currentServer?.type === "7d2d";
  const isPalworld = currentServer?.type === "palworld";

  const post7d2dAction = async (action: string, payload: Record<string, unknown>) => {
    setBusyAction(action);
    setMessage("");
    try {
      const res = await fetch(`/api/players?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage("Updated. Restart server for changes to take effect.");
        loadPlayers();
      } else {
        setMessage(result.message || "Action failed.");
      }
    } catch {
      setMessage("Action failed.");
    } finally {
      setBusyAction("");
    }
  };
  const whitelistEntries = (Array.isArray(data?.whitelist) ? data?.whitelist : []) as McEntry[];
  const banEntries = (Array.isArray(data?.bans) ? data?.bans : []) as McEntry[];
  const userCacheEntries = (Array.isArray(data?.userCache) ? data?.userCache : []) as McEntry[];
  const whitelistSet = new Set(whitelistEntries.map((entry) => entry.uuid).filter(Boolean));
  const banSet = new Set(banEntries.map((entry) => entry.uuid).filter(Boolean));
  const ops = players.filter((player) => player.isOp);

  const postAction = async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/players?server=${serverId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    return res.json();
  };

  const handleAddPlayer = async () => {
    if (!isMinecraft) return;
    if (!nameInput && !uuidInput) {
      setMessage("Provide a name or UUID to add a player.");
      return;
    }
    if (!addWhitelist && !addOp && !addBan) {
      setMessage("Pick at least one action (whitelist, admin, or ban).");
      return;
    }
    setBusyAction("add-player");
    setMessage("");
    try {
      const payload = { name: nameInput.trim(), uuid: uuidInput.trim() };
      const actions: string[] = [];
      if (addWhitelist) actions.push("whitelist-add");
      if (addOp) actions.push("op-add");
      if (addBan) actions.push("ban-add");

      for (const action of actions) {
        const result = await postAction(action, payload);
        if (!result.success) {
          setMessage(result.message || result.error || "Action failed.");
          setBusyAction("");
          return;
        }
      }
      setMessage("Player updated. Restart server for changes to take effect.");
      setNameInput("");
      setUuidInput("");
      loadPlayers();
    } catch {
      setMessage("Failed to update player.");
    } finally {
      setBusyAction("");
    }
  };

  const handleToggle = async (action: string, payload: Record<string, unknown>, success: string) => {
    setBusyAction(action);
    setMessage("");
    try {
      const result = await postAction(action, payload);
      if (result.success) {
        setMessage(success);
        loadPlayers();
      } else {
        setMessage(result.message || result.error || "Action failed.");
      }
    } catch {
      setMessage("Action failed.");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="space-y-4">
      {isMinecraft && (
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border">
            <h3 className="text-sm font-bold">Add Player</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-den-text-dim">Player Name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Player name"
                  className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-den-text-dim">UUID (optional)</label>
                <input
                  type="text"
                  value={uuidInput}
                  onChange={(e) => setUuidInput(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-[12px] text-den-text-muted">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addWhitelist}
                  onChange={(e) => setAddWhitelist(e.target.checked)}
                  className="accent-den-cyan"
                />
                Whitelist
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addOp}
                  onChange={(e) => setAddOp(e.target.checked)}
                  className="accent-den-amber"
                />
                Admin (OP)
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addBan}
                  onChange={(e) => setAddBan(e.target.checked)}
                  className="accent-den-red"
                />
                Ban
              </label>
            </div>
            <button
              onClick={handleAddPlayer}
              disabled={busyAction === "add-player"}
              className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-den-cyan to-[#29b6f6] text-den-bg rounded-lg disabled:opacity-40 hover:brightness-110 transition-all"
            >
              {busyAction === "add-player" ? "Saving..." : "Apply"}
            </button>
            <div className="text-[11px] text-den-text-dim">
              Tip: If the player has joined before, leave UUID blank and the server cache will fill it.
            </div>
          </div>
        </div>
      )}

      {isPalworld && (
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border">
            <h3 className="text-sm font-bold">Quick Actions</h3>
          </div>
          <div className="p-5 flex flex-wrap gap-3">
            <button
              onClick={loadPlayers}
              className="px-3 py-2 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface transition-colors"
            >
              Refresh Players
            </button>
            <button
              onClick={async () => {
                setBusyAction("save");
                const result = await postAction("save", {});
                setMessage(result.success ? "World saved!" : result.message);
                setBusyAction("");
              }}
              disabled={busyAction === "save"}
              className="px-3 py-2 text-xs font-semibold text-den-cyan border border-den-cyan/30 rounded-lg hover:bg-den-cyan/10 transition-colors"
            >
              {busyAction === "save" ? "Saving..." : "Save World"}
            </button>
            <button
              onClick={async () => {
                const msg = prompt("Broadcast message to all players:");
                if (!msg) return;
                setBusyAction("broadcast");
                const result = await postAction("broadcast", { message: msg });
                setMessage(result.success ? "Broadcast sent!" : result.message);
                setBusyAction("");
              }}
              disabled={busyAction === "broadcast"}
              className="px-3 py-2 text-xs font-semibold text-den-amber border border-den-amber/30 rounded-lg hover:bg-den-amber/10 transition-colors"
            >
              {busyAction === "broadcast" ? "Sending..." : "Broadcast Message"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
          <h3 className="text-sm font-bold">{isPalworld ? "Online Players" : "Registered Players"}</h3>
          {isPalworld && (
            <span className="text-[11px] text-den-text-dim font-medium">
              {players.length} online
            </span>
          )}
        </div>
        <div className="p-5">
          {players.length === 0 ? (
            <div className="text-center py-10 text-den-text-dim text-[13px]">
              {isPalworld ? "No players online" : "No players found"}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {players.map((player, i) => {
                const initial = player.name
                  ? player.name.charAt(0).toUpperCase()
                  : String.fromCharCode(65 + (i % 26));
                const shortUuid = `${player.uuid.substring(0, 8)}...${player.uuid.substring(player.uuid.length - 4)}`;

                return (
                  <div
                    key={player.uuid}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                      player.isOp
                        ? "border-[rgba(255,167,38,0.35)] bg-gradient-to-r from-[rgba(255,167,38,0.06)] to-den-surface shadow-[0_0_20px_rgba(255,167,38,0.08)]"
                        : "border-den-border bg-den-surface"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-md flex items-center justify-center text-lg font-extrabold shrink-0 ${
                          player.isOp
                            ? "bg-gradient-to-br from-den-amber to-[#ff7043] text-den-bg shadow-[0_0_12px_rgba(255,167,38,0.3)]"
                            : "bg-gradient-to-br from-den-cyan to-[#29b6f6] text-den-bg"
                        }`}
                      >
                        {player.isOp ? "\u2B50" : escapeHtml(initial)}
                      </div>
                      <div className="min-w-0">
                        {player.name && (
                          <div className="text-sm font-bold truncate">{player.name}</div>
                        )}
                        <div className="text-[10px] text-den-text-dim font-mono" title={player.uuid}>
                          {shortUuid}
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {player.groups.map((g) => (
                            <span
                              key={g}
                              className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                                g === "OP"
                                  ? "bg-[rgba(255,167,38,0.15)] text-den-amber border-[rgba(255,167,38,0.3)]"
                                  : "bg-[rgba(79,195,247,0.1)] text-den-cyan border-[rgba(79,195,247,0.2)]"
                              }`}
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* OP Toggle - only for Hytale */}
                    {isHytale && (
                      <div className="flex flex-col items-center gap-1.5 ml-3 shrink-0">
                        <span className="text-[10px] font-semibold text-den-text-dim uppercase tracking-wide">
                          {player.isOp ? "Operator" : "Player"}
                        </span>
                        <button
                          onClick={() => toggleOp(player.uuid, player.isOp)}
                          className={`relative w-12 h-[26px] rounded-full border-2 transition-all ${
                            player.isOp
                              ? "border-den-amber bg-[rgba(255,167,38,0.15)]"
                              : "border-den-border-light bg-den-bg"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-[18px] h-[18px] rounded-full transition-all ${
                              player.isOp
                                ? "left-[24px] bg-den-amber shadow-[0_0_10px_rgba(255,167,38,0.5)]"
                                : "left-0.5 bg-den-text-dim"
                            }`}
                          />
                        </button>
                      </div>
                    )}
                    {isMinecraft && (
                      <div className="flex flex-col gap-1.5 ml-3 shrink-0 text-[11px]">
                        <button
                          onClick={() =>
                            handleToggle(
                              player.isOp ? "op-remove" : "op-add",
                              { uuid: player.uuid, name: player.name },
                              player.isOp ? "OP removed." : "OP granted. Restart server for changes to take effect."
                            )
                          }
                          disabled={busyAction === "op-add" || busyAction === "op-remove"}
                          className="px-2 py-1 rounded-md border border-den-border text-den-text-muted hover:bg-den-surface transition-colors"
                        >
                          {player.isOp ? "Remove OP" : "Make OP"}
                        </button>
                        <button
                          onClick={() =>
                            handleToggle(
                              whitelistSet.has(player.uuid) ? "whitelist-remove" : "whitelist-add",
                              { uuid: player.uuid, name: player.name },
                              whitelistSet.has(player.uuid)
                                ? "Removed from whitelist."
                                : "Added to whitelist. Restart server for changes to take effect."
                            )
                          }
                          disabled={busyAction.startsWith("whitelist")}
                          className="px-2 py-1 rounded-md border border-den-border text-den-text-muted hover:bg-den-surface transition-colors"
                        >
                          {whitelistSet.has(player.uuid) ? "Remove WL" : "Whitelist"}
                        </button>
                        <button
                          onClick={() =>
                            handleToggle(
                              banSet.has(player.uuid) ? "ban-remove" : "ban-add",
                              { uuid: player.uuid, name: player.name },
                              banSet.has(player.uuid)
                                ? "Player unbanned."
                                : "Player banned. Restart server for changes to take effect."
                            )
                          }
                          disabled={busyAction.startsWith("ban")}
                          className="px-2 py-1 rounded-md border border-den-border text-den-text-muted hover:bg-den-surface transition-colors"
                        >
                          {banSet.has(player.uuid) ? "Unban" : "Ban"}
                        </button>
                      </div>
                    )}
                    {isPalworld && (
                      <div className="flex flex-col gap-1.5 ml-3 shrink-0 text-[11px]">
                        <button
                          onClick={async () => {
                            const action = player.isOp ? "demote" : "promote";
                            setBusyAction(`${action}-${player.uuid}`);
                            try {
                              const result = await postAction(action, { steamId: player.uuid });
                              setMessage(result.success
                                ? (player.isOp ? `Demoted ${player.name || player.uuid}` : `Promoted ${player.name || player.uuid} to Admin`)
                                : result.message);
                              if (result.success) loadPlayers();
                            } catch { setMessage("Action failed"); }
                            finally { setBusyAction(""); }
                          }}
                          disabled={busyAction === `promote-${player.uuid}` || busyAction === `demote-${player.uuid}`}
                          className={`px-2.5 py-1.5 rounded-md border font-medium transition-colors ${
                            player.isOp
                              ? "border-den-text-dim/30 text-den-text-muted bg-den-surface hover:bg-den-surface/80"
                              : "border-den-cyan/30 text-den-cyan bg-den-cyan/5 hover:bg-den-cyan/15"
                          }`}
                        >
                          {player.isOp ? "Demote" : "Admin"}
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Kick ${player.name || player.uuid}?`)) return;
                            setBusyAction(`kick-${player.uuid}`);
                            try {
                              const result = await postAction("kick", { steamId: player.uuid });
                              setMessage(result.success ? `Kicked ${player.name || player.uuid}` : result.message);
                              if (result.success) loadPlayers();
                            } catch { setMessage("Kick failed"); }
                            finally { setBusyAction(""); }
                          }}
                          disabled={busyAction === `kick-${player.uuid}`}
                          className="px-2.5 py-1.5 rounded-md border border-den-amber/30 text-den-amber bg-den-amber/5 hover:bg-den-amber/15 transition-colors font-medium"
                        >
                          {busyAction === `kick-${player.uuid}` ? "Kicking..." : "Kick"}
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Ban ${player.name || player.uuid}? This will immediately remove them from the server.`)) return;
                            setBusyAction(`ban-${player.uuid}`);
                            try {
                              const result = await postAction("ban", { steamId: player.uuid });
                              setMessage(result.success ? `Banned ${player.name || player.uuid}` : result.message);
                              if (result.success) loadPlayers();
                            } catch { setMessage("Ban failed"); }
                            finally { setBusyAction(""); }
                          }}
                          disabled={busyAction === `ban-${player.uuid}`}
                          className="px-2.5 py-1.5 rounded-md border border-den-red/30 text-den-red bg-den-red/5 hover:bg-den-red/15 transition-colors font-medium"
                        >
                          {busyAction === `ban-${player.uuid}` ? "Banning..." : "Ban"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isPalworld && pwAdmins.length > 0 && (
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Admin Whitelist</h3>
            <span className="text-[11px] text-den-text-dim font-medium">
              {pwAdmins.length} {pwAdmins.length === 1 ? "admin" : "admins"}
            </span>
          </div>
          <div className="p-5 space-y-3">
            {pwAdminPassword && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-den-surface/60 border border-den-border">
                <span className="text-[11px] text-den-text-dim shrink-0">Admin Password:</span>
                <code className="text-[12px] text-den-text font-mono">
                  {showAdminPassword ? pwAdminPassword : "\u2022".repeat(pwAdminPassword.length)}
                </code>
                <button
                  onClick={() => setShowAdminPassword((prev) => !prev)}
                  className="ml-auto px-2 py-0.5 text-[10px] font-semibold text-den-text-muted border border-den-border rounded hover:bg-den-surface transition-colors"
                >
                  {showAdminPassword ? "Hide" : "Show"}
                </button>
              </div>
            )}
            <div className="text-[11px] text-den-text-dim">
              Share the admin password with trusted players below. They use <code className="text-den-cyan">/AdminPassword</code> in-game to gain admin.
            </div>
            <div className="space-y-2">
              {pwAdmins.map((steamId) => {
                const onlinePlayer = players.find((p) => p.uuid === steamId);
                return (
                  <div
                    key={steamId}
                    className="flex items-center justify-between p-3 rounded-lg border border-[rgba(255,167,38,0.2)] bg-[rgba(255,167,38,0.04)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-extrabold bg-gradient-to-br from-den-amber to-[#ff7043] text-den-bg shadow-[0_0_12px_rgba(255,167,38,0.3)]">
                        {"\u2B50"}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold truncate">
                          {onlinePlayer?.name || "Offline"}
                        </div>
                        <div className="text-[10px] text-den-text-dim font-mono">{steamId}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      {onlinePlayer && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-den-green/10 text-den-green border-den-green/30">
                          Online
                        </span>
                      )}
                      <button
                        onClick={async () => {
                          setBusyAction(`demote-${steamId}`);
                          const result = await postAction("demote", { steamId });
                          setMessage(result.success ? "Admin removed" : result.message);
                          if (result.success) loadPlayers();
                          setBusyAction("");
                        }}
                        disabled={busyAction === `demote-${steamId}`}
                        className="px-2 py-1 text-[11px] rounded-md border border-den-border text-den-text-muted hover:bg-den-surface transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isMinecraft && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-den-border">
              <h3 className="text-sm font-bold">Admins (OP)</h3>
            </div>
            <div className="p-5 space-y-2">
              {ops.length === 0 ? (
                <div className="text-[13px] text-den-text-dim">No admins yet.</div>
              ) : (
                ops.map((op) => (
                  <div key={op.uuid} className="flex items-center justify-between text-[12px]">
                    <div className="flex flex-col">
                      <span className="text-den-text">{op.name || "Unknown"}</span>
                      <span className="text-den-text-dim font-mono">{op.uuid}</span>
                    </div>
                    <button
                      onClick={() =>
                        handleToggle("op-remove", { uuid: op.uuid, name: op.name }, "OP removed.")
                      }
                      disabled={busyAction === "op-remove"}
                      className="px-2 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-den-border">
              <h3 className="text-sm font-bold">Whitelist</h3>
            </div>
            <div className="p-5 space-y-2">
              {whitelistEntries.length === 0 ? (
                <div className="text-[13px] text-den-text-dim">Whitelist is empty.</div>
              ) : (
                whitelistEntries.map((entry) => (
                  <div key={entry.uuid || entry.name} className="flex items-center justify-between text-[12px]">
                    <div className="flex flex-col">
                      <span className="text-den-text">{entry.name || "Unknown"}</span>
                      <span className="text-den-text-dim font-mono">{entry.uuid || "--"}</span>
                    </div>
                    <button
                      onClick={() =>
                        handleToggle(
                          "whitelist-remove",
                          { uuid: entry.uuid, name: entry.name },
                          "Removed from whitelist."
                        )
                      }
                      disabled={busyAction === "whitelist-remove"}
                      className="px-2 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-den-border">
              <h3 className="text-sm font-bold">Ban List</h3>
            </div>
            <div className="p-5 space-y-2">
              {banEntries.length === 0 ? (
                <div className="text-[13px] text-den-text-dim">No bans.</div>
              ) : (
                banEntries.map((entry) => (
                  <div key={entry.uuid || entry.name} className="flex items-center justify-between text-[12px]">
                    <div className="flex flex-col">
                      <span className="text-den-text">{entry.name || "Unknown"}</span>
                      <span className="text-den-text-dim font-mono">{entry.uuid || "--"}</span>
                    </div>
                    <button
                      onClick={() =>
                        handleToggle(
                          "ban-remove",
                          { uuid: entry.uuid, name: entry.name },
                          "Player unbanned."
                        )
                      }
                      disabled={busyAction === "ban-remove"}
                      className="px-2 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface transition-colors"
                    >
                      Unban
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isMinecraft && userCacheEntries.length > 0 && (
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Known Players (Usercache)</h3>
            <span className="text-[11px] text-den-text-dim font-medium">
              {userCacheEntries.length} cached
            </span>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {userCacheEntries.map((entry) => (
              <div
                key={entry.uuid || entry.name}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-den-surface border border-den-border"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">{entry.name || "Unknown"}</div>
                  <div className="text-[11px] text-den-text-dim font-mono">{entry.uuid || "--"}</div>
                  {entry.expiresOn && (
                    <div className="text-[10px] text-den-text-dim">Seen: {String(entry.expiresOn)}</div>
                  )}
                </div>
                <div className="flex flex-col gap-1 text-[11px]">
                  <button
                    onClick={() =>
                      handleToggle(
                        "whitelist-add",
                        { uuid: entry.uuid, name: entry.name },
                        "Added to whitelist. Restart server for changes to take effect."
                      )
                    }
                    disabled={busyAction === "whitelist-add"}
                    className="px-2 py-1 rounded-md border border-den-border text-den-text-muted hover:bg-den-surface transition-colors"
                  >
                    Whitelist
                  </button>
                  <button
                    onClick={() =>
                      handleToggle(
                        "op-add",
                        { uuid: entry.uuid, name: entry.name },
                        "OP granted. Restart server for changes to take effect."
                      )
                    }
                    disabled={busyAction === "op-add"}
                    className="px-2 py-1 rounded-md border border-den-border text-den-text-muted hover:bg-den-surface transition-colors"
                  >
                    OP
                  </button>
                  <button
                    onClick={() =>
                      handleToggle(
                        "ban-add",
                        { uuid: entry.uuid, name: entry.name },
                        "Player banned. Restart server for changes to take effect."
                      )
                    }
                    disabled={busyAction === "ban-add"}
                    className="px-2 py-1 rounded-md border border-den-border text-den-text-muted hover:bg-den-surface transition-colors"
                  >
                    Ban
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- 7D2D Admin Management ---- */}
      {is7d2d && adminData && (
        <>
          {/* Add Admin User */}
          <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-den-border">
              <h3 className="text-sm font-bold">Add Admin / Whitelist / Ban</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] text-den-text-dim">Steam ID</label>
                  <input
                    type="text"
                    value={adminSteamId}
                    onChange={(e) => {
                      setAdminSteamId(e.target.value);
                      setWlSteamId(e.target.value);
                      setBlSteamId(e.target.value);
                    }}
                    placeholder="76561198..."
                    className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] text-den-text-dim">Display Name</label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => {
                      setAdminName(e.target.value);
                      setWlName(e.target.value);
                      setBlName(e.target.value);
                    }}
                    placeholder="Player name"
                    className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] text-den-text-dim">Permission Level (0-1000)</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={adminPermLevel}
                    onChange={(e) => setAdminPermLevel(e.target.value)}
                    className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    post7d2dAction("admin-add", {
                      platform: "Steam",
                      userId: adminSteamId,
                      name: adminName,
                      permissionLevel: parseInt(adminPermLevel) || 0,
                    });
                    setAdminSteamId("");
                    setAdminName("");
                    setAdminPermLevel("0");
                  }}
                  disabled={!adminSteamId || busyAction === "admin-add"}
                  className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-den-amber to-[#ff7043] text-den-bg rounded-lg disabled:opacity-40 hover:brightness-110 transition-all"
                >
                  Add Admin
                </button>
                <button
                  onClick={() => {
                    post7d2dAction("whitelist-add", {
                      platform: "Steam",
                      userId: wlSteamId || adminSteamId,
                      name: wlName || adminName,
                    });
                    setWlSteamId("");
                    setWlName("");
                  }}
                  disabled={!(wlSteamId || adminSteamId) || busyAction === "whitelist-add"}
                  className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-den-cyan to-[#29b6f6] text-den-bg rounded-lg disabled:opacity-40 hover:brightness-110 transition-all"
                >
                  Add to Whitelist
                </button>
                <button
                  onClick={() => {
                    post7d2dAction("blacklist-add", {
                      platform: "Steam",
                      userId: blSteamId || adminSteamId,
                      name: blName || adminName,
                      reason: blReason || "Banned via Dashboard",
                    });
                    setBlSteamId("");
                    setBlName("");
                    setBlReason("");
                  }}
                  disabled={!(blSteamId || adminSteamId) || busyAction === "blacklist-add"}
                  className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-den-red to-[#ef5350] text-white rounded-lg disabled:opacity-40 hover:brightness-110 transition-all"
                >
                  Ban Player
                </button>
              </div>
              <div className="text-[11px] text-den-text-dim">
                Permission levels: 0 = Super Admin, 1 = Admin, 2 = Moderator, 1000 = Regular Player.
                A user can run any command with a permission level equal to or above their own.
              </div>
            </div>
          </div>

          {/* Admin Users List */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
                <h3 className="text-sm font-bold">Admins</h3>
                <span className="text-[11px] text-den-text-dim">{adminData.users.length} users</span>
              </div>
              <div className="p-5 space-y-2">
                {adminData.users.length === 0 ? (
                  <div className="text-[13px] text-den-text-dim">No admins configured.</div>
                ) : (
                  adminData.users.map((user) => (
                    <div
                      key={user.userId}
                      className="flex items-center justify-between p-3 rounded-lg bg-den-surface border border-[rgba(255,167,38,0.2)]"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-semibold truncate">{user.name || "Unknown"}</span>
                        <span className="text-[11px] text-den-text-dim font-mono">{user.userId}</span>
                        <span className="text-[10px] text-den-amber font-semibold">
                          Level {user.permissionLevel}
                          {user.permissionLevel === 0 && " (Super Admin)"}
                          {user.permissionLevel === 1 && " (Admin)"}
                          {user.permissionLevel === 2 && " (Moderator)"}
                        </span>
                      </div>
                      <button
                        onClick={() => post7d2dAction("admin-remove", { userId: user.userId })}
                        disabled={busyAction === "admin-remove"}
                        className="px-2 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface transition-colors shrink-0 ml-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Whitelist */}
            <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
                <h3 className="text-sm font-bold">Whitelist</h3>
                <span className="text-[11px] text-den-text-dim">{adminData.whitelist.length} entries</span>
              </div>
              <div className="p-5 space-y-2">
                {adminData.whitelist.length === 0 ? (
                  <div className="text-[13px] text-den-text-dim">
                    Whitelist is empty. Adding entries enables whitelist-only mode.
                  </div>
                ) : (
                  <>
                    <div className="text-[11px] text-den-amber bg-den-amber/10 border border-den-amber/20 rounded-md px-3 py-2 mb-2">
                      Whitelist is active. Only listed players can join.
                    </div>
                    {adminData.whitelist.map((entry) => (
                      <div key={entry.userId} className="flex items-center justify-between text-[12px]">
                        <div className="flex flex-col min-w-0">
                          <span className="text-den-text truncate">{entry.name || "Unknown"}</span>
                          <span className="text-den-text-dim font-mono">{entry.userId}</span>
                        </div>
                        <button
                          onClick={() => post7d2dAction("whitelist-remove", { userId: entry.userId })}
                          disabled={busyAction === "whitelist-remove"}
                          className="px-2 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface transition-colors shrink-0 ml-2"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Blacklist */}
            <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
                <h3 className="text-sm font-bold">Ban List</h3>
                <span className="text-[11px] text-den-text-dim">{adminData.blacklist.length} bans</span>
              </div>
              <div className="p-5 space-y-2">
                {adminData.blacklist.length === 0 ? (
                  <div className="text-[13px] text-den-text-dim">No bans.</div>
                ) : (
                  adminData.blacklist.map((entry) => (
                    <div key={entry.userId} className="flex items-center justify-between text-[12px]">
                      <div className="flex flex-col min-w-0">
                        <span className="text-den-text truncate">{entry.name || "Unknown"}</span>
                        <span className="text-den-text-dim font-mono">{entry.userId}</span>
                        {entry.reason && (
                          <span className="text-[10px] text-den-red">{entry.reason}</span>
                        )}
                      </div>
                      <button
                        onClick={() => post7d2dAction("blacklist-remove", { userId: entry.userId })}
                        disabled={busyAction === "blacklist-remove"}
                        className="px-2 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface transition-colors shrink-0 ml-2"
                      >
                        Unban
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Command Permissions */}
          <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
              <h3 className="text-sm font-bold">Command Permissions</h3>
              <span className="text-[11px] text-den-text-dim">
                {adminData.commands.length} commands configured
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-[11px] text-den-text-dim mb-2">
                Commands not listed here default to permission level 0 (admin only).
                Set a command to 1000 to allow all players to use it.
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-den-text-dim">Command</label>
                  <input
                    type="text"
                    value={cmdName}
                    onChange={(e) => setCmdName(e.target.value)}
                    placeholder="say"
                    className="px-3 py-1.5 bg-den-bg text-den-text text-[12px] rounded-lg border border-den-border focus:border-den-border-light outline-none font-mono w-40"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-den-text-dim">Level</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={cmdPermLevel}
                    onChange={(e) => setCmdPermLevel(e.target.value)}
                    className="px-3 py-1.5 bg-den-bg text-den-text text-[12px] rounded-lg border border-den-border focus:border-den-border-light outline-none w-20"
                  />
                </div>
                <button
                  onClick={() => {
                    if (cmdName.trim()) {
                      post7d2dAction("command-update", {
                        cmd: cmdName.trim(),
                        permissionLevel: parseInt(cmdPermLevel) || 0,
                      });
                      setCmdName("");
                      setCmdPermLevel("0");
                    }
                  }}
                  disabled={!cmdName.trim() || busyAction === "command-update"}
                  className="px-3 py-1.5 text-[11px] font-semibold bg-gradient-to-r from-den-cyan to-[#29b6f6] text-den-bg rounded-lg disabled:opacity-40 hover:brightness-110 transition-all"
                >
                  Add / Update
                </button>
              </div>
              {adminData.commands.length > 0 && (
                <div className="border border-den-border rounded-lg overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-den-surface">
                        <th className="px-3 py-2 text-left text-den-text-dim font-semibold">Command</th>
                        <th className="px-3 py-2 text-left text-den-text-dim font-semibold w-24">Level</th>
                        <th className="px-3 py-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminData.commands
                        .sort((a, b) => a.cmd.localeCompare(b.cmd))
                        .map((cmd) => (
                          <tr key={cmd.cmd} className="border-t border-den-border hover:bg-den-surface/50">
                            <td className="px-3 py-2 font-mono text-den-text">{cmd.cmd}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  cmd.permissionLevel === 1000
                                    ? "bg-den-green/10 text-den-green border border-den-green/20"
                                    : cmd.permissionLevel === 0
                                      ? "bg-den-amber/10 text-den-amber border border-den-amber/20"
                                      : "bg-den-surface text-den-text-muted border border-den-border"
                                }`}
                              >
                                {cmd.permissionLevel}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => post7d2dAction("command-remove", { cmd: cmd.cmd })}
                                disabled={busyAction === "command-remove"}
                                className="text-[10px] text-den-text-dim hover:text-den-red transition-colors"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {message && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="px-5 py-3 rounded-lg text-sm font-medium shadow-lg backdrop-blur-sm bg-den-cyan-dim/90 text-den-cyan border border-den-cyan/40">
            {message}
            <button onClick={() => setMessage("")} className="ml-3 opacity-60 hover:opacity-100">x</button>
          </div>
        </div>
      )}
    </div>
  );
}
