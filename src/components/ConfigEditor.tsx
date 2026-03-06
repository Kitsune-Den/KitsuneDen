"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useState, useCallback, useRef } from "react";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatLabel(key: string): string {
  const label = key
    // camelCase: insert space before uppercase letter preceded by lowercase
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // ACRONYMS: insert space before uppercase+lowercase preceded by multiple uppercase
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
  return label.replace(/\bPvp\b/g, "PVP");
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

  const fieldHelp = {
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
    WorldGenSize: "Map size in meters. Must be between 2048 and 16384.",
    QuestProgressionDailyLimit: "Max quests per day. Set to 0 or -1 to remove the limit.",
    BiomeProgression: "When enabled, biome difficulty increases as you move further from spawn. Disable for uniform difficulty everywhere.",
    StormFreq: "Controls storm frequency. 0 disables storms, 100 is default. Higher values (up to 500) mean more frequent storms.",
    BedrollDeadZoneSize: "Distance in blocks around a bedroll where zombies won't spawn.",
    HideCommandExecutionLog: "Controls visibility of command execution in logs.",
    TelnetFailedLoginLimit: "Max failed telnet login attempts before blocking.",
    TelnetFailedLoginsBlocktime: "Block time in seconds after exceeding failed login limit.",
    LootRespawnDays: "Crossplay requires 0 (disabled) or 5+. Values 1-4 will prevent server start.",
    WorldGenSize: "Must be a multiple of 2048. Non-standard values will crash world generation.",
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
          QuestProgressionDailyLimit: "3",
          BlockDamagePlayer: "100",
          BlockDamageAI: "100",
          BlockDamageAIBM: "100",
          JarRefund: "0",
          BiomeProgression: "true",
          StormFreq: "100",
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

  const renderField = (key: string) => {
    const value = formValues[key];
    const isBoolean =
      typeof value === "boolean" ||
      (format === "properties" && (value === "true" || value === "false"));
    const isNumber = typeof value === "number";
    const isObject = value && typeof value === "object";
    const error = formErrors[key];
    const helpText = fieldHelp[key as keyof typeof fieldHelp];
    const label = formatLabel(key);
    const tooltip = helpText ? `${helpText} (key: ${key})` : `Key: ${key}`;

    const isMinecraft = currentServer?.type === "minecraft";
    const is7d2d = currentServer?.type === "7d2d";
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
        ) : sdSelectOptions ? (
          <select
            value={String(value ?? "")}
            onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
            className="w-full max-w-[280px] px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
          >
            {Array.from(
              new Map([
                ...(sdSelectOptions.find((o) => o.value === String(value ?? ""))
                  ? []
                  : [[String(value ?? ""), String(value ?? "")]]),
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
        "MaxUncoveredMapChunksPerPlayer",
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
        "DayNightLength",
        "DayLightLength",
        "BuildCreate",
        "PlayerKillingMode",
        "PersistentPlayerProfiles",
        "PlayerSafeZoneLevel",
        "PlayerSafeZoneHours",
        "PartySharedKillRange",
        "QuestProgressionDailyLimit",
        "JarRefund",
        "BiomeProgression",
        "StormFreq",
      ],
    },
    {
      title: "Zombies",
      keys: [
        "ZombieMove",
        "ZombieMoveNight",
        "ZombieFeralMove",
        "ZombieBMMove",
        "EnemySpawnMode",
        "EnemyDifficulty",
        "BloodMoonEnemyCount",
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
      ],
    },
    {
      title: "Network & Slots",
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
        "AdminFileName",
        "ServerAdminSlots",
        "ServerAdminSlotsPermission",
        "HideCommandExecutionLog",
        "TelnetEnabled",
        "TelnetPort",
        "TelnetPassword",
        "TelnetFailedLoginLimit",
        "TelnetFailedLoginsBlocktime",
      ],
    },
    {
      title: "Server",
      keys: [
        "ServerWebsiteURL",
        "TerminalWindowEnabled",
        "WebDashboardEnabled",
        "WebDashboardPort",
        "WebDashboardUrl",
        "EACEnabled",
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
                ]);
                const remainingKeys = Object.keys(formValues)
                  .filter((key) => !usedKeys.has(key))
                  .sort((a, b) => a.localeCompare(b));
                const groups = sevenDaysGroups
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
