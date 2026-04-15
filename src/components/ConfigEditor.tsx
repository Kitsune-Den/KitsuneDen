"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { resolveDayNightConfig, reverseDayNightConfig } from "@/lib/day-night";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatLabel(key: string): string {
  // Strip Unreal Engine boolean prefix (bSomething → Something)
  let cleaned = key;
  if (/^b[A-Z]/.test(cleaned)) {
    cleaned = cleaned.slice(1);
  }
  const label = cleaned
    // camelCase: insert space before uppercase letter preceded by lowercase
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // ACRONYMS: insert space before uppercase+lowercase preceded by multiple uppercase
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
  return label.replace(/\bPvp\b/g, "PVP").replace(/\bHp\b/g, "HP");
}

export default function ConfigEditor() {
  const { serverId, currentServer } = useServer();
  const [config, setConfig] = useState<string>("");
  const [original, setOriginal] = useState<string>("");
  const [originalJson, setOriginalJson] = useState<string>("");
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [formDrafts, setFormDrafts] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<"properties" | "json">("json");
  const [viewMode, setViewMode] = useState<"form" | "raw">("form");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [mods, setMods] = useState<{ name: string; sizeBytes: number }[]>([]);
  const [availableWorlds, setAvailableWorlds] = useState<string[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (message) {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setMessage(""), 5000);
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [message]);

  const palworldFieldHelp: Record<string, string> = {
    ServerName: "The name shown in the server browser.",
    ServerDescription: "Description shown when players view your server.",
    AdminPassword: "Password for admin access. Also used for RCON authentication.",
    ServerPassword: "Password players must enter to join. Leave empty for no password.",
    ServerPlayerMaxNum: "Maximum number of players allowed on the server (1–32).",
    DayTimeSpeedRate: "Multiplier for daytime speed. 1.0 is normal, 2.0 is twice as fast.",
    NightTimeSpeedRate: "Multiplier for nighttime speed. 1.0 is normal, 0.5 makes nights longer.",
    ExpRate: "Experience gain multiplier. Higher = faster leveling.",
    PalCaptureRate: "Multiplier for Pal capture chance. 2.0 doubles the base rate.",
    PalSpawnNumRate: "Multiplier for number of Pals spawned in the world.",
    PalDamageRateAttack: "Multiplier for damage dealt by Pals.",
    PalDamageRateDefense: "Multiplier for damage received by Pals. Higher = less damage taken.",
    PlayerDamageRateAttack: "Multiplier for damage dealt by players.",
    PlayerDamageRateDefense: "Multiplier for damage received by players. Higher = less damage taken.",
    PlayerStomachDecreaceRate: "Rate at which player hunger decreases. Lower = slower hunger.",
    PlayerStaminaDecreaceRate: "Rate at which player stamina decreases. Lower = slower drain.",
    PlayerAutoHPRegeneRate: "Rate of automatic HP regeneration while awake.",
    PlayerAutoHpRegeneRateInSleep: "Rate of HP regeneration while sleeping.",
    PalStomachDecreaceRate: "Rate at which Pal hunger decreases.",
    PalStaminaDecreaceRate: "Rate at which Pal stamina decreases.",
    PalAutoHPRegeneRate: "Rate of automatic Pal HP regeneration.",
    PalAutoHpRegeneRateInSleep: "Rate of Pal HP regeneration in Palbox.",
    BuildObjectHpRate: "Multiplier for building HP. Higher = tougher structures.",
    BuildObjectDamageRate: "Multiplier for damage to buildings.",
    BuildObjectDeteriorationDamageRate: "Rate of building deterioration over time. 0 disables decay.",
    CollectionDropRate: "Multiplier for resources dropped from gathering.",
    CollectionObjectHpRate: "HP of gatherable objects like trees and rocks.",
    CollectionObjectRespawnSpeedRate: "How quickly gathered resources respawn. Higher = faster.",
    EnemyDropItemRate: "Multiplier for items dropped by enemies.",
    DeathPenalty: "What happens when a player dies.",
    bEnablePlayerToPlayerDamage: "Allow players to damage each other.",
    bEnableFriendlyFire: "Allow damage to players in the same guild.",
    bEnableInvaderEnemy: "Enable enemy raids on player bases.",
    DropItemMaxNum: "Max number of dropped items in the world at once.",
    BaseCampMaxNum: "Max total bases across all guilds on the server.",
    BaseCampWorkerMaxNum: "Max Pals working at a single base (1–20).",
    GuildPlayerMaxNum: "Max players per guild.",
    BaseCampMaxNumInGuild: "Max bases per guild.",
    PalEggDefaultHatchingTime: "Default egg hatch time in hours. 72 = 3 real days.",
    WorkSpeedRate: "Multiplier for Pal work speed at bases.",
    AutoSaveSpan: "Minutes between auto-saves.",
    bIsMultiplay: "Must be True for dedicated servers.",
    bIsPvP: "Enable PvP mode.",
    bEnableFastTravel: "Allow fast travel via Eagle Statues.",
    bExistPlayerAfterLogout: "Keep player character in world after logout.",
    bEnableNonLoginPenalty: "Apply penalties to Pals when owner is offline.",
    ServerPlayerMaxNum_desc: "Max players that can be online simultaneously.",
    CoopPlayerMaxNum: "Max players in a co-op session (only for listen servers).",
    PublicPort: "UDP port the server listens on. Default 8211.",
    PublicIP: "Your public IP. Leave empty for LAN-only.",
    RCONEnabled: "Enable remote console access for admin commands.",
    RCONPort: "Port for RCON connections. Default 25575.",
    RESTAPIEnabled: "Enable the REST API for server management.",
    RESTAPIPort: "Port for REST API. Default 8212.",
    bShowPlayerList: "Show player list in server info.",
    bUseAuth: "Require Steam authentication. Should stay enabled.",
    ChatPostLimitPerMinute: "Max chat messages per player per minute.",
    bIsUseBackupSaveData: "Enable automatic backup saves.",
    SupplyDropSpan: "Minutes between supply drops.",
    EnablePredatorBossPal: "Enable alpha/boss Pals spawning in the world.",
    bAllowClientMod: "Allow players to use client-side mods.",
    bHardcore: "Enable hardcore mode (permanent death).",
    bPalLost: "Pals are permanently lost on death in hardcore.",
    bAllowGlobalPalboxExport: "Allow exporting Pals via global Palbox.",
    bAllowGlobalPalboxImport: "Allow importing Pals via global Palbox.",
    ItemWeightRate: "Multiplier for item weight. Lower = items weigh less.",
    MaxBuildingLimitNum: "Max building pieces per base. 0 = unlimited.",
  };

  const fieldHelp = {
    ...(currentServer?.type === "palworld" ? palworldFieldHelp : {}),
    ...(currentServer?.type === "hytale"
      ? {
          DisplayTmpTagsInStrings:
            "Controls whether temporary/template tags inside strings are shown. Leave off unless you rely on tag output.",
        }
      : {}),
    BlockDamagePlayer:
      "Scales how much damage players deal to blocks (percentage). 300% is popular for solo play to reduce resource grind.",
    BlockDamageAI:
      "Scales zombie/animal damage to blocks during normal play. Lower to 25-50% to prevent zombies clawing through walls.",
    BlockDamageAIBM:
      "Scales zombie damage to blocks during Blood Moon only. Separate from normal AI damage so hordes can hit harder (or softer).",
    JarRefund:
      "Percentage chance to get an empty jar back after drinking. 0% means jars are consumed, 100% always returns the jar.",
    "max-world-size": "Range 1-29999984 (in blocks). Default is 29999984.",
    LootAbundance: "Percentage of loot (0-200%). Default is 100%.",
    WorldGenSize: "Map size in meters. Must be between 2048 and 16384. Must be a multiple of 2048.",
    QuestProgressionDailyLimit: "Max quests per day. Set to 0 or -1 to remove the limit.",
    BiomeProgression: "When enabled, biome difficulty increases as you move further from spawn. Disable for uniform difficulty everywhere.",
    StormFreq: "Controls storm frequency. 0 disables storms, 100 is default. Higher values (up to 500) mean more frequent storms.",
    BedrollDeadZoneSize: "Distance in blocks around a bedroll where zombies won't spawn.",
    HideCommandExecutionLog: "Controls visibility of command execution in logs.",
    TelnetFailedLoginLimit: "Max failed telnet login attempts before blocking.",
    TelnetFailedLoginsBlocktime: "Block time in seconds after exceeding failed login limit.",
    LootRespawnDays: "Crossplay requires 0 (disabled) or 5+. Values 1-4 will prevent server start.",
    BloodMoonFrequency: "Blood moon horde every N days.",
    BloodMoonRange: "Random +/- days added to blood moon schedule (0 = exact).",
    BloodMoonWarning: "Hours before blood moon the warning appears.",
    XPMultiplier: "XP gain multiplier (%). Higher values = faster leveling.",
    DeathPenalty: "XP penalty when a player dies.",
    PlayerSafeZoneLevel: "Player level at which safe zone protection ends.",
    PlayerSafeZoneHours: "Hours of safe zone protection for new players.",
    PartySharedKillRange: "Distance in meters for party members to share XP from kills.",
    AllowSpawnNearFriend: "Can new players select to join near a friend on first connect?",
    ZombieFeralSense: "Feral zombies can sense players through walls and obstacles.",
    AISmellMode: "How fast zombies move when tracking players by scent. Zombies can smell blood, food, and forges.",
    LandClaimCount: "Maximum allowed land claims per player.",
    LandClaimOfflineDelay: "Minutes after logout before land claim switches from online to offline hardness.",
    BedrollExpiryTime: "Real-world days a bedroll stays active after owner was last online.",
    EACEnabled: "Easy Anti-Cheat — disabling allows modded clients to connect.",
    ServerAllowCrossplay: "Enable crossplay between platforms.",
    IgnoreEOSSanctions: "Ignore EOS sanctions when allowing players to join.",
    CameraRestrictionMode: "Restrict which camera perspective players can use.",
    TwitchServerPermission: "Permission level required to use Twitch integration on the server.",
    TwitchBloodMoonAllowed: "Allow Twitch actions during blood moon. Can cause lag from extra zombie spawns.",
    ServerMaxAllowedViewDistance: "Max view distance a client may request (6-12). High impact on memory and performance.",
    EnableMapRendering: "Render the map to tile images while exploring. Used by the web dashboard.",
    DynamicMeshEnabled: "Enable the dynamic mesh system for improved visuals.",
    DynamicMeshLandClaimOnly: "Only use dynamic mesh in land claim areas.",
    DynamicMeshLandClaimBuffer: "Dynamic mesh land claim chunk radius.",
    DynamicMeshMaxItemCache: "Max items processed concurrently. Higher values use more RAM.",
    MaxChunkAge: "In-game days before unvisited/unprotected chunks reset. -1 = never.",
    SaveDataLimit: "Max disk space per save in MB. -1 = no limit.",
    MaxQueuedMeshLayers: "Max chunk mesh layers queued during generation.",
    ServerDisabledNetworkProtocols: "Protocols to disable. Dedicated servers should disable SteamNetworking if port-forwarding is set up.",
    ServerReservedSlotsPermission: "Permission level required to use reserved slots.",
    PersistentPlayerProfiles: "If enabled, players always join with the last profile they used.",
  };

  function syncFormFromObject(nextConfig: Record<string, unknown>) {
    const skipDraftKeys = currentServer?.type === "hytale" ? ["Defaults"] : [];
    setFormValues(nextConfig);
    const drafts: Record<string, string> = {};
    Object.entries(nextConfig).forEach(([key, value]) => {
      if (value && typeof value === "object" && !skipDraftKeys.includes(key)) {
        drafts[key] = JSON.stringify(value, null, 2);
      }
    });
    setFormDrafts(drafts);
    setFormErrors({});
  }

  const loadedServerRef = useRef<string>("");

  const loadConfig = useCallback(async () => {
    // Skip reload if we already loaded for this server (prevents polling-triggered reloads)
    const serverKey = `${serverId}:${currentServer?.type ?? ""}`;
    if (loadedServerRef.current === serverKey) return;
    try {
      const res = await fetch(`/api/config?server=${serverId}`);
      const data = await res.json();
      setFormat(data.format || "json");
      const nextConfig = (data.config as Record<string, unknown>) || {};
      // Inject defaults for 7D2D fields that may not exist in the XML yet
      if (currentServer?.type === "7d2d") {
        const defaults7d2d: Record<string, string> = {
          // Block Damage
          BlockDamagePlayer: "100",
          BlockDamageAI: "100",
          BlockDamageAIBM: "100",
          // Gameplay
          BloodMoonFrequency: "7",
          BloodMoonRange: "0",
          BloodMoonWarning: "8",
          BloodMoonEnemyCount: "8",
          BiomeProgression: "true",
          StormFreq: "100",
          QuestProgressionDailyLimit: "10",
          // Player
          XPMultiplier: "100",
          DeathPenalty: "1",
          JarRefund: "0",
          PlayerSafeZoneLevel: "5",
          PlayerSafeZoneHours: "5",
          PartySharedKillRange: "100",
          AllowSpawnNearFriend: "2",
          BedrollExpiryTime: "45",
          // Zombies
          ZombieFeralSense: "0",
          AISmellMode: "3",
          // Land Claims
          LandClaimCount: "5",
          LandClaimOfflineDelay: "0",
          // Admin
          IgnoreEOSSanctions: "false",
          CameraRestrictionMode: "0",
          TwitchServerPermission: "90",
          TwitchBloodMoonAllowed: "false",
          // World
          ServerAllowCrossplay: "false",
          // Advanced
          ServerMaxAllowedViewDistance: "12",
          EnableMapRendering: "false",
          DynamicMeshEnabled: "true",
          DynamicMeshLandClaimOnly: "true",
          DynamicMeshLandClaimBuffer: "3",
          DynamicMeshMaxItemCache: "3",
          MaxChunkAge: "-1",
          SaveDataLimit: "-1",
          MaxQueuedMeshLayers: "1000",
        };
        for (const [key, value] of Object.entries(defaults7d2d)) {
          if (!Object.prototype.hasOwnProperty.call(nextConfig, key)) {
            nextConfig[key] = value;
          }
        }
      }
      const text = JSON.stringify(nextConfig, null, 2);
      setConfig(text);
      setOriginal(text);
      setOriginalJson(JSON.stringify(nextConfig));
      syncFormFromObject(nextConfig);
      loadedServerRef.current = serverKey;
    } catch {
      setMessage("Failed to load config");
    }
  }, [serverId, currentServer?.type]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!serverId || !currentServer?.capabilities.hasMods) {
      setMods([]);
      return;
    }
    fetch(`/api/mods?server=${serverId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setMods((data.files as { name: string; sizeBytes: number }[]) || []))
      .catch(() => setMods([]));
  }, [serverId, currentServer?.capabilities.hasMods]);

  useEffect(() => {
    if (!serverId || currentServer?.type !== "7d2d") {
      setAvailableWorlds([]);
      return;
    }
    fetch(`/api/7d2d-worlds?server=${serverId}`)
      .then((res) => res.json())
      .then((data) => setAvailableWorlds(data.worlds || []))
      .catch(() => setAvailableWorlds([]));
  }, [serverId, currentServer?.type]);

  const buildConfigFromForm = () => {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(formValues)) {
      if (
        Object.prototype.hasOwnProperty.call(formDrafts, key) &&
        !(currentServer?.type === "hytale" && key === "Defaults")
      ) {
        const raw = formDrafts[key];
        try {
          output[key] = JSON.parse(raw);
        } catch {
          return null;
        }
      } else {
        output[key] = formValues[key];
      }
    }
    return output;
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      let parsed: Record<string, unknown>;
      if (viewMode === "form") {
        const formConfig = buildConfigFromForm();
        if (!formConfig) {
          setMessage("Fix invalid JSON fields before saving.");
          setSaving(false);
          return;
        }
        parsed = formConfig;
      } else {
        parsed = JSON.parse(config);
      }
      const res = await fetch(`/api/config?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Config saved. Restart server for changes to take effect.");
        const text = JSON.stringify(parsed, null, 2);
        setConfig(text);
        setOriginal(text);
        setOriginalJson(JSON.stringify(parsed));
      } else {
        setMessage(`Save failed: ${data.message || data.error}`);
      }
    } catch (e) {
      setMessage(`Invalid JSON: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const formConfig = viewMode === "form" ? buildConfigFromForm() : null;
  const hasChanges =
    viewMode === "form"
      ? (formConfig ? JSON.stringify(formConfig) : "") !== originalJson
      : config !== original;

  const handleJsonDraftChange = (key: string, value: string) => {
    setFormDrafts((prev) => ({ ...prev, [key]: value }));
    try {
      JSON.parse(value);
      setFormErrors((prev) => ({ ...prev, [key]: "" }));
    } catch (err) {
      setFormErrors((prev) => ({ ...prev, [key]: (err as Error).message }));
    }
  };

  const updateDefaults = (patch: Record<string, unknown>) => {
    setFormValues((prev) => {
      const existing = prev.Defaults;
      const base =
        existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
      return {
        ...prev,
        Defaults: {
          ...base,
          ...patch,
        },
      };
    });
  };

  // ---- Day/Night friendly widget ----
  const dayNightFriendly = useMemo(() => {
    const dnl = Number(formValues["DayNightLength"]) || 60;
    const dll = Number(formValues["DayLightLength"]) || 18;
    return reverseDayNightConfig(dnl, dll);
  }, [formValues["DayNightLength"], formValues["DayLightLength"]]);

  const setDayNight = useCallback((dayMinutes: number, nightMinutes: number) => {
    if (dayMinutes <= 0 || nightMinutes <= 0) return;
    const { DayNightLength, DayLightLength } = resolveDayNightConfig({ dayMinutes, nightMinutes });
    setFormValues((prev) => ({
      ...prev,
      DayNightLength: String(DayNightLength),
      DayLightLength: String(DayLightLength),
    }));
  }, []);

  const renderDayNightWidget = () => {
    const { dayMinutes, nightMinutes } = dayNightFriendly;
    const total = dayMinutes + nightMinutes;
    const dayPct = Math.round((dayMinutes / total) * 100);
    return (
      <div key="__DayNightWidget__" className="flex flex-col gap-3">
        <label className="text-[13px] text-den-text-muted">Day / Night Cycle</label>
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-den-text-dim uppercase tracking-wider">Day</span>
              <span className="text-[12px] text-den-text-muted">{dayMinutes} min</span>
            </div>
            <input
              type="range"
              min={1}
              max={total - 1}
              value={dayMinutes}
              onChange={(e) => {
                const newDay = Number(e.target.value);
                setDayNight(newDay, total - newDay);
              }}
              className="w-full accent-amber-400"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-den-text-dim uppercase tracking-wider">Night</span>
              <span className="text-[12px] text-den-text-muted">{nightMinutes} min</span>
            </div>
            <input
              type="range"
              min={1}
              max={total - 1}
              value={nightMinutes}
              onChange={(e) => {
                const newNight = Number(e.target.value);
                setDayNight(total - newNight, newNight);
              }}
              className="w-full accent-indigo-400"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full overflow-hidden bg-den-border">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-200"
              style={{ width: `${dayPct}%` }}
            />
          </div>
          <span className="text-[11px] text-den-text-dim whitespace-nowrap">{total} min total</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-den-text-dim">Total cycle:</label>
          <input
            type="number"
            min={10}
            max={240}
            value={total}
            onChange={(e) => {
              const newTotal = Math.max(10, Math.min(240, Number(e.target.value)));
              const ratio = dayMinutes / total;
              const newDay = Math.max(1, Math.min(newTotal - 1, Math.round(ratio * newTotal)));
              setDayNight(newDay, newTotal - newDay);
            }}
            className="w-20 px-2 py-1 bg-den-bg text-den-text text-[12px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
          />
          <span className="text-[11px] text-den-text-dim">min</span>
        </div>
        <div className="text-[11px] text-den-text-dim">
          Replaces DayNightLength ({String(formValues["DayNightLength"])}) and DayLightLength ({String(formValues["DayLightLength"])})
        </div>
      </div>
    );
  };

  const renderField = (key: string) => {
    if (key === "__DayNightWidget__") return renderDayNightWidget();
    const value = formValues[key];
    const isPalworld = currentServer?.type === "palworld";
    const isBoolean =
      typeof value === "boolean" ||
      (format === "properties" && (value === "true" || value === "false")) ||
      (isPalworld && (value === "True" || value === "False"));
    const isNumber = typeof value === "number";
    const isObject = value && typeof value === "object";
    const error = formErrors[key];
    const helpText = fieldHelp[key as keyof typeof fieldHelp];
    const label = formatLabel(key);
    const tooltip = helpText ? `${helpText} (key: ${key})` : `Key: ${key}`;

    const isMinecraft = currentServer?.type === "minecraft";
    const is7d2d = currentServer?.type === "7d2d";
    const pwSelectOptions = isPalworld ? palworldSelectOptions[key] : undefined;
    const mcSelectOptions: Record<string, string[]> = {
      difficulty: ["peaceful", "easy", "normal", "hard"],
      gamemode: ["survival", "creative", "adventure", "spectator"],
    };
    const selectOptions = isMinecraft ? mcSelectOptions[key] : undefined;
    const selectValues = selectOptions
      ? Array.from(new Set([String(value ?? ""), ...selectOptions].filter(Boolean)))
      : null;
    const sdSelectOptions = is7d2d ? sevenDaysSelectOptions[key] : undefined;

    return (
      <div key={key} className="flex flex-col gap-2">
        <label className="text-[13px] text-den-text-muted" title={tooltip}>
          {label}
        </label>
        {isObject ? (
          <textarea
            value={formDrafts[key] ?? JSON.stringify(value, null, 2)}
            onChange={(e) => handleJsonDraftChange(key, e.target.value)}
            spellCheck={false}
            className="w-full min-h-[120px] p-3 bg-den-bg text-den-text font-mono text-[12px] leading-6 rounded-lg border border-den-border focus:border-den-border-light outline-none"
          />
        ) : pwSelectOptions ? (
          <select
            value={String(value ?? "")}
            onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
            className="w-full max-w-[280px] px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
          >
            {Array.from(
              new Map<string, string>([
                ...(pwSelectOptions.find((o: { value: string }) => o.value === String(value ?? ""))
                  ? []
                  : ([[String(value ?? ""), String(value ?? "")]] as [string, string][])),
                ...pwSelectOptions.map((o: { value: string; label: string }) => [o.value, o.label] as [string, string]),
              ])
            ).map(([val, lbl]) => (
              <option key={val} value={val}>
                {lbl}
              </option>
            ))}
          </select>
        ) : sdSelectOptions ? (
          <select
            value={String(value ?? "")}
            onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
            className="w-full max-w-[280px] px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
          >
            {Array.from(
              new Map<string, string>([
                ...(sdSelectOptions.find((o) => o.value === String(value ?? ""))
                  ? []
                  : ([[String(value ?? ""), String(value ?? "")]] as [string, string][])),
                ...sdSelectOptions.map((o) => [o.value, o.label] as [string, string]),
              ])
            ).map(([val, lbl]) => (
              <option key={val} value={val}>
                {lbl}
              </option>
            ))}
          </select>
        ) : selectValues ? (
          <select
            value={String(value ?? "")}
            onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
            className="w-full max-w-[220px] px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
          >
            {selectValues.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : isBoolean && isPalworld ? (
          <button
            type="button"
            onClick={() =>
              setFormValues((prev) => ({
                ...prev,
                [key]: value === "True" ? "False" : "True",
              }))
            }
            className="flex items-center gap-3 w-fit"
          >
            <div
              className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${
                value === "True"
                  ? "bg-den-cyan"
                  : "bg-den-border"
              }`}
            >
              <div
                className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${
                  value === "True" ? "translate-x-[20px]" : "translate-x-[2px]"
                }`}
              />
            </div>
            <span className="text-[12px] text-den-text-muted">
              {value === "True" ? "Enabled" : "Disabled"}
            </span>
          </button>
        ) : isBoolean ? (
          <select
            value={String(value)}
            onChange={(e) =>
              setFormValues((prev) => ({
                ...prev,
                [key]: format === "properties" ? e.target.value : e.target.value === "true",
              }))
            }
            className="w-full max-w-[220px] px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : isNumber ? (
          <input
            type="number"
            value={String(value)}
            onChange={(e) =>
              setFormValues((prev) => ({ ...prev, [key]: Number(e.target.value) }))
            }
            className="w-full max-w-[220px] px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
          />
        ) : (
          <input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
            className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
          />
        )}
        {error && <div className="text-[12px] text-den-red">Invalid JSON: {error}</div>}
        {helpText && <div className="text-[12px] text-den-text-dim">{helpText}</div>}
      </div>
    );
  };

  const sevenDaysCoreKeys = ["ServerName", "ServerPassword", "ServerDescription", "ServerLoginConfirmationText"];
  const sevenDaysGroups = [
    {
      title: "World",
      keys: [
        "GameWorld",
        "WorldGenSeed",
        "WorldGenSize",
        "GameName",
        "GameMode",
        "BedrollDeadZoneSize",
        "BedrollExpiryTime",
        "MaxUncoveredMapChunksPerPlayer",
        "EACEnabled",
        "ServerAllowCrossplay",
      ],
    },
    {
      title: "Block Damage",
      keys: [
        "BlockDamagePlayer",
        "BlockDamageAI",
        "BlockDamageAIBM",
      ],
    },
    {
      title: "Gameplay",
      keys: [
        "GameDifficulty",
        "__DayNightWidget__",
        "BuildCreate",
        "BloodMoonFrequency",
        "BloodMoonRange",
        "BloodMoonWarning",
        "BloodMoonEnemyCount",
        "BiomeProgression",
        "StormFreq",
        "QuestProgressionDailyLimit",
      ],
    },
    {
      title: "Player",
      keys: [
        "XPMultiplier",
        "PlayerKillingMode",
        "PlayerSafeZoneLevel",
        "PlayerSafeZoneHours",
        "PartySharedKillRange",
        "DeathPenalty",
        "JarRefund",
        "AllowSpawnNearFriend",
        "PersistentPlayerProfiles",
      ],
    },
    {
      title: "Zombies",
      keys: [
        "ZombieMove",
        "ZombieMoveNight",
        "ZombieFeralMove",
        "ZombieBMMove",
        "ZombieFeralSense",
        "AISmellMode",
        "EnemySpawnMode",
        "EnemyDifficulty",
        "MaxSpawnedZombies",
        "MaxSpawnedAnimals",
      ],
    },
    {
      title: "Loot & Drops",
      keys: [
        "LootAbundance",
        "LootRespawnDays",
        "AirDropFrequency",
        "AirDropMarker",
        "DropOnDeath",
        "DropOnQuit",
      ],
    },
    {
      title: "Land Claims",
      keys: [
        "LandClaimSize",
        "LandClaimDeadZone",
        "LandClaimExpiryTime",
        "LandClaimDecayMode",
        "LandClaimOnlineDurabilityModifier",
        "LandClaimOfflineDurabilityModifier",
        "LandClaimCount",
        "LandClaimOfflineDelay",
      ],
    },
    {
      title: "Network",
      keys: [
        "ServerPort",
        "ServerVisibility",
        "ServerMaxPlayerCount",
        "ServerReservedSlots",
        "ServerReservedSlotsPermission",
        "ServerMaxWorldTransferSpeedKiBs",
        "ServerDisabledNetworkProtocols",
      ],
    },
    {
      title: "Admin",
      keys: [
        "TelnetEnabled",
        "TelnetPort",
        "TelnetPassword",
        "TelnetFailedLoginLimit",
        "TelnetFailedLoginsBlocktime",
        "AdminFileName",
        "ServerAdminSlots",
        "ServerAdminSlotsPermission",
        "ServerReservedSlotsPermission",
        "HideCommandExecutionLog",
        "IgnoreEOSSanctions",
        "PersistentPlayerProfiles",
        "CameraRestrictionMode",
        "TwitchServerPermission",
        "TwitchBloodMoonAllowed",
      ],
    },
    {
      title: "Advanced",
      keys: [
        "ServerWebsiteURL",
        "ServerMaxAllowedViewDistance",
        "TerminalWindowEnabled",
        "WebDashboardEnabled",
        "WebDashboardPort",
        "WebDashboardUrl",
        "EnableMapRendering",
        "DynamicMeshEnabled",
        "DynamicMeshLandClaimOnly",
        "DynamicMeshLandClaimBuffer",
        "DynamicMeshMaxItemCache",
        "MaxChunkAge",
        "SaveDataLimit",
        "MaxQueuedMeshLayers",
      ],
    },
  ];
  const blockDamageOptions = [
    { value: "25", label: "25%" },
    { value: "50", label: "50%" },
    { value: "75", label: "75%" },
    { value: "100", label: "100% (Default)" },
    { value: "125", label: "125%" },
    { value: "150", label: "150%" },
    { value: "175", label: "175%" },
    { value: "200", label: "200%" },
    { value: "300", label: "300%" },
  ];
  const aiBlockDamageOptions = [
    { value: "25", label: "25%" },
    { value: "33", label: "33%" },
    { value: "50", label: "50%" },
    { value: "67", label: "67%" },
    { value: "75", label: "75%" },
    { value: "100", label: "100% (Default)" },
    { value: "125", label: "125%" },
    { value: "150", label: "150%" },
    { value: "175", label: "175%" },
    { value: "200", label: "200%" },
    { value: "300", label: "300%" },
  ];
  const sevenDaysSelectOptions: Record<string, { value: string; label: string }[]> = {
    BlockDamagePlayer: blockDamageOptions,
    BlockDamageAI: aiBlockDamageOptions,
    BlockDamageAIBM: aiBlockDamageOptions,
    BiomeProgression: [
      { value: "true", label: "Enabled" },
      { value: "false", label: "Disabled" },
    ],
    StormFreq: [
      { value: "0", label: "0 - Disabled" },
      { value: "50", label: "50 - Low" },
      { value: "100", label: "100 - Default" },
      { value: "150", label: "150" },
      { value: "200", label: "200" },
      { value: "300", label: "300" },
      { value: "400", label: "400" },
      { value: "500", label: "500 - Maximum" },
    ],
    JarRefund: [
      { value: "0", label: "0% - Disabled" },
      { value: "5", label: "5%" },
      { value: "10", label: "10%" },
      { value: "20", label: "20%" },
      { value: "30", label: "30%" },
      { value: "40", label: "40%" },
      { value: "50", label: "50%" },
      { value: "60", label: "60%" },
      { value: "70", label: "70%" },
      { value: "80", label: "80%" },
      { value: "90", label: "90%" },
      { value: "100", label: "100%" },
    ],
    GameDifficulty: [
      { value: "0", label: "0 - Scavenger" },
      { value: "1", label: "1 - Adventurer" },
      { value: "2", label: "2 - Nomad" },
      { value: "3", label: "3 - Warrior" },
      { value: "4", label: "4 - Survivalist" },
      { value: "5", label: "5 - Insane" },
    ],
    DropOnDeath: [
      { value: "0", label: "0 - Nothing" },
      { value: "1", label: "1 - Everything" },
      { value: "2", label: "2 - Toolbelt Only" },
      { value: "3", label: "3 - Backpack Only" },
    ],
    ServerVisibility: [
      { value: "0", label: "0 - Not Listed" },
      { value: "1", label: "1 - Friends Only" },
      { value: "2", label: "2 - Public" },
    ],
    PlayerKillingMode: [
      { value: "0", label: "0 - No Killing" },
      { value: "1", label: "1 - Kill Allies Only" },
      { value: "2", label: "2 - Kill Strangers Only" },
      { value: "3", label: "3 - Kill Everyone" },
    ],
    EnemySpawnMode: [
      { value: "true", label: "Enabled" },
      { value: "false", label: "Disabled" },
    ],
    BuildCreate: [
      { value: "true", label: "Enabled (Cheat Mode)" },
      { value: "false", label: "Disabled" },
    ],
    EACEnabled: [
      { value: "true", label: "Enabled" },
      { value: "false", label: "Disabled" },
    ],
    TelnetEnabled: [
      { value: "true", label: "Enabled" },
      { value: "false", label: "Disabled" },
    ],
    WebDashboardEnabled: [
      { value: "true", label: "Enabled" },
      { value: "false", label: "Disabled" },
    ],
    AirDropMarker: [
      { value: "true", label: "Shown" },
      { value: "false", label: "Hidden" },
    ],
    ZombieMove: [
      { value: "0", label: "0 - Walk" },
      { value: "1", label: "1 - Jog" },
      { value: "2", label: "2 - Run" },
      { value: "3", label: "3 - Sprint" },
      { value: "4", label: "4 - Nightmare" },
    ],
    ZombieMoveNight: [
      { value: "0", label: "0 - Walk" },
      { value: "1", label: "1 - Jog" },
      { value: "2", label: "2 - Run" },
      { value: "3", label: "3 - Sprint" },
      { value: "4", label: "4 - Nightmare" },
    ],
    ZombieFeralMove: [
      { value: "0", label: "0 - Walk" },
      { value: "1", label: "1 - Jog" },
      { value: "2", label: "2 - Run" },
      { value: "3", label: "3 - Sprint" },
      { value: "4", label: "4 - Nightmare" },
    ],
    ZombieBMMove: [
      { value: "0", label: "0 - Walk" },
      { value: "1", label: "1 - Jog" },
      { value: "2", label: "2 - Run" },
      { value: "3", label: "3 - Sprint" },
      { value: "4", label: "4 - Nightmare" },
    ],
    EnemyDifficulty: [
      { value: "0", label: "0 - Normal" },
      { value: "1", label: "1 - Feral" },
    ],
    DropOnQuit: [
      { value: "0", label: "0 - No" },
      { value: "1", label: "1 - Yes" },
      { value: "2", label: "2 - Toolbelt Only" },
      { value: "3", label: "3 - Backpack Only" },
    ],
    GameMode: [
      { value: "GameModeSurvival", label: "Survival" },
    ],
    GameWorld: [
      { value: "RWG", label: "RWG (Random Gen)" },
      ...availableWorlds.map((w) => ({ value: w, label: w })),
    ],
    LandClaimDecayMode: [
      { value: "0", label: "0 - Linear" },
      { value: "1", label: "1 - Exponential" },
      { value: "2", label: "2 - Full Protection" },
    ],
    HideCommandExecutionLog: [
      { value: "0", label: "0 - Show Everything" },
      { value: "1", label: "1 - Hide from Telnet/Control Panel" },
      { value: "2", label: "2 - Also Hide from Remote Clients" },
      { value: "3", label: "3 - Hide Everything" },
    ],
    TerminalWindowEnabled: [
      { value: "true", label: "Enabled" },
      { value: "false", label: "Disabled" },
    ],
    PersistentPlayerProfiles: [
      { value: "true", label: "Enabled" },
      { value: "false", label: "Disabled" },
    ],
    DeathPenalty: [
      { value: "0", label: "0 - None" },
      { value: "1", label: "1 - Default" },
      { value: "2", label: "2 - Injured" },
      { value: "3", label: "3 - Permanent Death" },
    ],
    XPMultiplier: [
      { value: "25", label: "25%" },
      { value: "50", label: "50%" },
      { value: "75", label: "75%" },
      { value: "100", label: "100%" },
      { value: "125", label: "125%" },
      { value: "150", label: "150%" },
      { value: "200", label: "200%" },
      { value: "300", label: "300%" },
    ],
    AllowSpawnNearFriend: [
      { value: "0", label: "0 - Disabled" },
      { value: "1", label: "1 - Always" },
      { value: "2", label: "2 - Only Near Friends in Forest" },
    ],
    ZombieFeralSense: [
      { value: "0", label: "0 - Off" },
      { value: "1", label: "1 - Day Only" },
      { value: "2", label: "2 - Night Only" },
      { value: "3", label: "3 - All" },
    ],
    AISmellMode: [
      { value: "0", label: "0 - Off" },
      { value: "1", label: "1 - Walk" },
      { value: "2", label: "2 - Jog" },
      { value: "3", label: "3 - Run" },
      { value: "4", label: "4 - Sprint" },
      { value: "5", label: "5 - Nightmare" },
    ],
    ServerAllowCrossplay: [
      { value: "true", label: "On" },
      { value: "false", label: "Off" },
    ],
    IgnoreEOSSanctions: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
    CameraRestrictionMode: [
      { value: "0", label: "0 - Free (1st & 3rd)" },
      { value: "1", label: "1 - First Person Only" },
      { value: "2", label: "2 - Third Person Only" },
    ],
    TwitchBloodMoonAllowed: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
    EnableMapRendering: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
    DynamicMeshEnabled: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
    DynamicMeshLandClaimOnly: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
    ServerDisabledNetworkProtocols: [
      { value: "", label: "None" },
      { value: "SteamNetworking", label: "SteamNetworking" },
      { value: "LiteNetLib", label: "LiteNetLib" },
      { value: "SteamNetworking,LiteNetLib", label: "Both" },
    ],
    LootRespawnDays: [
      { value: "0", label: "0 - Disabled" },
      { value: "5", label: "5 Days" },
      { value: "7", label: "7 Days" },
      { value: "10", label: "10 Days" },
      { value: "15", label: "15 Days" },
      { value: "20", label: "20 Days" },
      { value: "30", label: "30 Days" },
    ],
    WorldGenSize: [
      { value: "2048", label: "2048 - Tiny" },
      { value: "4096", label: "4096 - Small" },
      { value: "6144", label: "6144 - Medium" },
      { value: "8192", label: "8192 - Large" },
      { value: "10240", label: "10240 - Very Large" },
      { value: "12288", label: "12288 - Huge" },
      { value: "16384", label: "16384 - Maximum" },
    ],
  };

  // ---- Palworld config layout ----

  const palworldCoreKeys = ["ServerName", "ServerDescription", "AdminPassword", "ServerPassword"];

  const palworldGroups = [
    {
      title: "Rates & Multipliers",
      keys: [
        "ExpRate", "WorkSpeedRate", "DayTimeSpeedRate", "NightTimeSpeedRate",
        "PalCaptureRate", "PalSpawnNumRate", "CollectionDropRate",
        "CollectionObjectHpRate", "CollectionObjectRespawnSpeedRate", "EnemyDropItemRate",
        "ItemWeightRate",
      ],
    },
    {
      title: "Player Stats",
      keys: [
        "PlayerDamageRateAttack", "PlayerDamageRateDefense",
        "PlayerStomachDecreaceRate", "PlayerStaminaDecreaceRate",
        "PlayerAutoHPRegeneRate", "PlayerAutoHpRegeneRateInSleep",
      ],
    },
    {
      title: "Pal Stats",
      keys: [
        "PalDamageRateAttack", "PalDamageRateDefense",
        "PalStomachDecreaceRate", "PalStaminaDecreaceRate",
        "PalAutoHPRegeneRate", "PalAutoHpRegeneRateInSleep",
        "PalEggDefaultHatchingTime",
      ],
    },
    {
      title: "Building",
      keys: [
        "BuildObjectHpRate", "BuildObjectDamageRate", "BuildObjectDeteriorationDamageRate",
        "bBuildAreaLimit", "MaxBuildingLimitNum",
      ],
    },
    {
      title: "Combat & PvP",
      keys: [
        "bEnablePlayerToPlayerDamage", "bEnableFriendlyFire", "bIsPvP",
        "bEnableInvaderEnemy", "EnablePredatorBossPal", "bHardcore", "bPalLost",
        "DeathPenalty",
      ],
    },
    {
      title: "Base & Guild",
      keys: [
        "BaseCampMaxNum", "BaseCampWorkerMaxNum", "BaseCampMaxNumInGuild",
        "GuildPlayerMaxNum",
        "bAutoResetGuildNoOnlinePlayers", "AutoResetGuildTimeNoOnlinePlayers",
      ],
    },
    {
      title: "Gameplay",
      keys: [
        "bIsMultiplay", "ServerPlayerMaxNum", "CoopPlayerMaxNum",
        "bEnableFastTravel", "bEnableFastTravelOnlyBaseCamp",
        "bIsStartLocationSelectByMap", "bExistPlayerAfterLogout",
        "bEnableNonLoginPenalty", "AutoSaveSpan",
        "DropItemMaxNum", "DropItemAliveMaxHours",
        "SupplyDropSpan", "bIsUseBackupSaveData",
      ],
    },
    {
      title: "Network & Admin",
      keys: [
        "PublicPort", "PublicIP", "Region",
        "RCONEnabled", "RCONPort",
        "RESTAPIEnabled", "RESTAPIPort",
        "bUseAuth", "bShowPlayerList",
        "ChatPostLimitPerMinute",
      ],
    },
    {
      title: "Crossplay & Mods",
      keys: [
        "bAllowClientMod",
        "bAllowGlobalPalboxExport", "bAllowGlobalPalboxImport",
      ],
    },
  ];

  const palworldSelectOptions: Record<string, { value: string; label: string }[]> = {
    Difficulty: [
      { value: "None", label: "None (Custom)" },
      { value: "Normal", label: "Normal" },
      { value: "Difficult", label: "Difficult" },
      { value: "Easy", label: "Casual" },
    ],
    DeathPenalty: [
      { value: "None", label: "None — Keep everything" },
      { value: "Item", label: "Drop Items only" },
      { value: "ItemAndEquipment", label: "Drop Items & Equipment" },
      { value: "All", label: "Drop All (Items, Equipment, Pals)" },
    ],
    LogFormatType: [
      { value: "Text", label: "Text" },
      { value: "Json", label: "JSON" },
    ],
  };

  const minecraftCoreKeys = ["server-name", "level-seed", "motd"];
  const minecraftGroups = [
    {
      title: "Gameplay",
      keys: ["pvp", "allow-flight", "enable-command-block", "hardcore", "difficulty", "gamemode"],
    },
    {
      title: "World",
      keys: [
        "level-name",
        "spawn-protection",
        "max-world-size",
        "view-distance",
        "simulation-distance",
        "generate-structures",
      ],
    },
    {
      title: "Players",
      keys: ["max-players", "white-list", "enforce-whitelist", "online-mode"],
    },
    {
      title: "Network",
      keys: ["server-ip", "server-port", "enable-status", "enable-query", "enable-rcon"],
    },
    {
      title: "Performance",
      keys: ["sync-chunk-writes", "max-tick-time", "use-native-transport"],
    },
    {
      title: "Misc",
      keys: ["allow-nether", "broadcast-rcon-to-ops", "broadcast-console-to-ops"],
    },
  ];

  const switchToRaw = () => {
    if (viewMode === "raw") return;
    const nextConfig = buildConfigFromForm();
    if (!nextConfig) {
      setMessage("Fix invalid JSON fields before switching views.");
      return;
    }
    const text = JSON.stringify(nextConfig, null, 2);
    setConfig(text);
    setViewMode("raw");
  };

  const switchToForm = () => {
    if (viewMode === "form") return;
    try {
      const parsed = JSON.parse(config) as Record<string, unknown>;
      syncFormFromObject(parsed);
      setViewMode("form");
    } catch (e) {
      setMessage(`Invalid JSON: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
          <h3 className="text-sm font-bold">
            Server Configuration
            <span className="ml-2 text-den-text-dim text-xs font-normal">
              ({currentServer?.type === "7d2d"
                ? "serverconfig.xml"
                : currentServer?.type === "palworld"
                  ? "PalWorldSettings.ini"
                  : format === "properties"
                    ? "server.properties"
                    : "config.json"})
            </span>
          </h3>
          <div className="flex gap-2 items-center">
            <div className="flex rounded-lg border border-den-border overflow-hidden">
              <button
                onClick={switchToForm}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === "form"
                    ? "bg-den-elevated text-den-text"
                    : "text-den-text-muted hover:bg-den-surface"
                }`}
              >
                Form View
              </button>
              <button
                onClick={switchToRaw}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === "raw"
                    ? "bg-den-elevated text-den-text"
                    : "text-den-text-muted hover:bg-den-surface"
                }`}
              >
                Raw JSON
              </button>
            </div>
            <button
              onClick={() => {
                setConfig(original);
                setMessage("");
                try {
                  syncFormFromObject(JSON.parse(original || "{}"));
                } catch {
                  syncFormFromObject({});
                }
              }}
              disabled={!hasChanges}
              className="px-3 py-1 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface disabled:opacity-40 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="px-3 py-1 text-xs font-semibold bg-gradient-to-r from-den-cyan to-[#29b6f6] text-den-bg rounded-lg disabled:opacity-40 hover:brightness-110 transition-all"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
        {viewMode === "raw" ? (
          <div className="p-0">
            <textarea
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              spellCheck={false}
              className="w-full min-h-[400px] max-h-[600px] p-4 bg-den-bg text-den-text font-mono text-[13px] leading-7 outline-none resize-y border-0"
            />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {Object.keys(formValues).length === 0 ? (
              <div className="text-sm text-den-text-dim">No config fields found.</div>
            ) : currentServer?.type === "7d2d" ? (
              (() => {
                const usedKeys = new Set<string>([
                  ...sevenDaysCoreKeys,
                  ...sevenDaysGroups.flatMap((group) => group.keys),
                  "DayNightLength", "DayLightLength",
                ]);
                const remainingKeys = Object.keys(formValues)
                  .filter((key) => !usedKeys.has(key))
                  .sort((a, b) => a.localeCompare(b));
                const hasKey = (key: string) =>
                  key === "__DayNightWidget__"
                    ? Object.prototype.hasOwnProperty.call(formValues, "DayNightLength")
                    : Object.prototype.hasOwnProperty.call(formValues, key);
                const groups = sevenDaysGroups
                  .filter((group) =>
                    group.keys.some(hasKey)
                  )
                  .map((group) => ({
                    ...group,
                    keys: group.keys.filter(hasKey),
                  }));

                if (remainingKeys.length > 0) {
                  groups.push({ title: "Other", keys: remainingKeys });
                }

                return (
                  <>
                    <div className="bg-gradient-to-r from-den-surface/60 to-transparent border border-den-border rounded-xl p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-5 rounded-full bg-gradient-to-b from-den-cyan to-[#29b6f6]" />
                        <h4 className="text-sm font-bold tracking-wide uppercase text-den-text">Core Settings</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {sevenDaysCoreKeys.map((key) =>
                          Object.prototype.hasOwnProperty.call(formValues, key) ? renderField(key) : null
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {groups.map((group) => (
                        <div
                          key={group.title}
                          className="bg-den-surface/40 border border-den-border rounded-xl p-4 space-y-3"
                        >
                          <div className="text-[12px] uppercase tracking-widest text-den-text-dim font-semibold">
                            {group.title}
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {group.keys.map((key) => renderField(key))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()
            ) : currentServer?.type === "minecraft" ? (
              (() => {
                const usedKeys = new Set<string>([
                  ...minecraftCoreKeys,
                  ...minecraftGroups.flatMap((group) => group.keys),
                ]);
                const remainingKeys = Object.keys(formValues)
                  .filter((key) => !usedKeys.has(key))
                  .sort((a, b) => a.localeCompare(b));
                const groups = minecraftGroups
                  .filter((group) =>
                    group.keys.some((key) => Object.prototype.hasOwnProperty.call(formValues, key))
                  )
                  .map((group) => ({
                    ...group,
                    keys: group.keys.filter((key) =>
                      Object.prototype.hasOwnProperty.call(formValues, key)
                    ),
                  }));

                if (remainingKeys.length > 0) {
                  groups.push({ title: "Other", keys: remainingKeys });
                }

                return (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-[13px] text-den-text-muted">Core</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {minecraftCoreKeys.map((key) =>
                          Object.prototype.hasOwnProperty.call(formValues, key) ? renderField(key) : null
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {groups.map((group) => (
                        <div
                          key={group.title}
                          className="bg-den-surface/40 border border-den-border rounded-xl p-4 space-y-3"
                        >
                          <div className="text-[12px] uppercase tracking-widest text-den-text-dim font-semibold">
                            {group.title}
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {group.keys.map((key) => renderField(key))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()
            ) : currentServer?.type === "palworld" ? (
              (() => {
                const usedKeys = new Set<string>([
                  ...palworldCoreKeys,
                  ...palworldGroups.flatMap((group) => group.keys),
                ]);
                const remainingKeys = Object.keys(formValues)
                  .filter((key) => !usedKeys.has(key))
                  .sort((a, b) => a.localeCompare(b));
                const groups = palworldGroups
                  .filter((group) =>
                    group.keys.some((key) => Object.prototype.hasOwnProperty.call(formValues, key))
                  )
                  .map((group) => ({
                    ...group,
                    keys: group.keys.filter((key) =>
                      Object.prototype.hasOwnProperty.call(formValues, key)
                    ),
                  }));

                if (remainingKeys.length > 0) {
                  groups.push({ title: "Other", keys: remainingKeys });
                }

                return (
                  <>
                    {/* Core Settings */}
                    <div className="bg-gradient-to-r from-den-surface/60 to-transparent border border-den-border rounded-xl p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-5 rounded-full bg-gradient-to-b from-den-cyan to-[#29b6f6]" />
                        <h4 className="text-sm font-bold tracking-wide uppercase text-den-text">Core Settings</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {palworldCoreKeys.map((key) =>
                          Object.prototype.hasOwnProperty.call(formValues, key) ? renderField(key) : null
                        )}
                      </div>
                    </div>

                    {/* Categorized Groups */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {groups.map((group) => (
                        <div
                          key={group.title}
                          className="bg-den-surface/40 border border-den-border rounded-xl p-4 space-y-3"
                        >
                          <div className="text-[12px] uppercase tracking-widest text-den-text-dim font-semibold">
                            {group.title}
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {group.keys.map((key) => renderField(key))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()
            ) : (
              <>
                {currentServer?.type === "hytale" && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] text-den-text-muted">Server</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <span className="text-[12px] text-den-text-dim">Server Name</span>
                        <input
                          type="text"
                          value={String(formValues.ServerName ?? "")}
                          onChange={(e) =>
                            setFormValues((prev) => ({ ...prev, ServerName: e.target.value }))
                          }
                          className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-[12px] text-den-text-dim">Password</span>
                        <div className="flex items-center gap-2">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={String(formValues.Password ?? "")}
                            onChange={(e) =>
                              setFormValues((prev) => ({ ...prev, Password: e.target.value }))
                            }
                            className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="px-2 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface transition-colors"
                          >
                            {showPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[12px] text-den-text-dim">MOTD</span>
                      <input
                        type="text"
                        value={String(formValues.MOTD ?? "")}
                        onChange={(e) =>
                          setFormValues((prev) => ({ ...prev, MOTD: e.target.value }))
                        }
                        className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                      />
                    </div>
                  </div>
                )}
                {currentServer?.type === "hytale" && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] text-den-text-muted">Defaults</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <span className="text-[12px] text-den-text-dim">World</span>
                        <input
                          type="text"
                          value={String((formValues.Defaults as Record<string, unknown>)?.World ?? "")}
                          onChange={(e) => updateDefaults({ World: e.target.value })}
                          className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-[12px] text-den-text-dim">Game Mode</span>
                        <select
                          value={String((formValues.Defaults as Record<string, unknown>)?.GameMode ?? "")}
                          onChange={(e) => updateDefaults({ GameMode: e.target.value })}
                          className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                        >
                          {Array.from(
                            new Set(
                              [
                                String((formValues.Defaults as Record<string, unknown>)?.GameMode ?? ""),
                                "Adventure",
                                "Survival",
                                "Creative",
                                "Spectator",
                              ].filter(Boolean)
                            )
                          ).map((mode) => (
                            <option key={mode} value={mode}>
                              {mode}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
                {Object.keys(formValues)
                  .filter((key) => {
                    if (currentServer?.type !== "hytale") return true;
                    return ![
                      "AuthCredentialStore",
                      "ConnectionTimeouts",
                      "Defaults",
                      "LogLevels",
                      "MOTD",
                      "Modules",
                      "Password",
                      "PlayerStorage",
                      "RateLimit",
                      "Mods",
                      "ServerName",
                      "Update",
                      "Version",
                    ].includes(key);
                  })
                  .sort((a, b) => a.localeCompare(b))
                  .map((key) => renderField(key))}
              </>
            )}
          </div>
        )}
      </div>

      {(currentServer?.capabilities.hasMods || currentServer?.capabilities.hasBackups) && (
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border">
            <h3 className="text-sm font-bold">Quick Links</h3>
          </div>
          <div className="p-5 flex flex-wrap gap-3">
            {currentServer?.capabilities.hasMods && (
              <button
                onClick={() => {
                  window.location.hash = "mods";
                }}
                className="px-4 py-2 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface transition-colors"
              >
                Go to Mods
              </button>
            )}
            {currentServer?.capabilities.hasBackups && (
              <button
                onClick={() => {
                  window.location.hash = "backups";
                }}
                className="px-4 py-2 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface transition-colors"
              >
                Go to Backups
              </button>
            )}
          </div>
        </div>
      )}

      {currentServer?.capabilities.hasMods && (
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Mods Summary</h3>
            <span className="text-[11px] text-den-text-dim font-medium">
              {mods.length} installed
            </span>
          </div>
          <div className="p-5">
            {mods.length === 0 ? (
              <div className="text-[13px] text-den-text-dim">
                No mods detected. Use the Mods page to upload files.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {mods.slice(0, 5).map((mod) => (
                  <div
                    key={mod.name}
                    className="flex items-center justify-between text-[12px] border-b border-[rgba(42,51,85,0.5)] last:border-0 py-2"
                  >
                    <span className="text-den-text">{mod.name}</span>
                    <span className="text-den-text-dim font-mono">{formatBytes(mod.sizeBytes)}</span>
                  </div>
                ))}
                {mods.length > 5 && (
                  <div className="text-[11px] text-den-text-dim">And {mods.length - 5} more...</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {message && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div
            className={`px-5 py-3 rounded-lg text-sm font-medium shadow-lg backdrop-blur-sm ${
              message.includes("failed") || message.includes("Invalid")
                ? "bg-den-red-dim/90 text-den-red border border-den-red/40"
                : "bg-den-green-dim/90 text-den-green border border-den-green/40"
            }`}
          >
            {message}
            <button
              onClick={() => setMessage("")}
              className="ml-3 text-current opacity-60 hover:opacity-100"
            >
              x
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
