"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useState, useCallback } from "react";
import {
  Crosshair,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Save,
  Clock,
  MapPin,
  Package,
  ToggleLeft,
  ToggleRight,
  Pencil,
  X,
} from "lucide-react";

// ---- Types ----

interface LootEntry {
  id: number;
  itemName: string;
  minQuantity: number;
  maxQuantity: number;
  weight: number;
}

interface LootTable {
  id: number;
  createdAt: string;
  name: string;
  isEnabled: boolean;
  description: string | null;
  entries: LootEntry[];
}

interface HistoryEntry {
  id: number;
  created_at: string;
  loot_table_name: string;
  position: string;
  item_summary: string;
}

type Tab = "loot-tables" | "settings" | "history";

// ---- Helpers ----

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---- Component ----

export default function AirdropManager() {
  const { serverId, currentServer } = useServer();
  const [tab, setTab] = useState<Tab>("loot-tables");

  if (!currentServer || currentServer.type !== "hytale") return null;

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-den-surface border border-den-border rounded-lg p-1">
        {(["loot-tables", "settings", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              tab === t
                ? "bg-den-cyan-glow text-den-cyan shadow-[inset_0_0_12px_rgba(79,195,247,0.1)]"
                : "text-den-text-muted hover:text-den-text hover:bg-den-elevated"
            }`}
          >
            {t === "loot-tables" ? "Loot Tables" : t === "settings" ? "Settings" : "History"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "loot-tables" && <LootTablesTab serverId={serverId} />}
      {tab === "settings" && <SettingsTab serverId={serverId} />}
      {tab === "history" && <HistoryTab serverId={serverId} />}
    </div>
  );
}

// ======== LOOT TABLES TAB ========

function LootTablesTab({ serverId }: { serverId: string }) {
  const [tables, setTables] = useState<LootTable[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [message, setMessage] = useState("");

  const loadTables = useCallback(async () => {
    try {
      const res = await fetch(`/api/airdrops/loot-tables?server=${serverId}`);
      const data = await res.json();
      setTables(data.tables || []);
    } catch {
      /* ignore */
    }
  }, [serverId]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const createTable = async () => {
    if (!newName.trim()) return;
    setMessage("");
    try {
      const res = await fetch(`/api/airdrops/loot-tables?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      });
      const data = await res.json();
      if (data.success) {
        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        loadTables();
      } else {
        setMessage(data.error || "Failed to create");
      }
    } catch {
      setMessage("Failed to create loot table");
    }
  };

  const deleteTable = async (id: number, name: string) => {
    if (!confirm(`Delete loot table "${name}" and all its entries?`)) return;
    try {
      await fetch(`/api/airdrops/loot-tables?server=${serverId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      loadTables();
    } catch {
      /* ignore */
    }
  };

  const toggleEnabled = async (table: LootTable) => {
    try {
      await fetch(`/api/airdrops/loot-tables?server=${serverId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: table.id, isEnabled: !table.isEnabled }),
      });
      loadTables();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3">
      {/* Create button / form */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-den-cyan to-[#29b6f6] text-den-bg rounded-lg text-sm font-semibold hover:brightness-110 hover:shadow-[0_0_16px_rgba(79,195,247,0.3)] transition-all"
        >
          <Plus size={16} />
          New Loot Table
        </button>
      ) : (
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-cyan/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-den-cyan">New Loot Table</h3>
            <button onClick={() => setShowCreate(false)} className="text-den-text-dim hover:text-den-text">
              <X size={16} />
            </button>
          </div>
          <input
            type="text"
            placeholder="Table name (e.g. common_loot)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-den-surface border border-den-border rounded-lg px-3 py-2 text-sm text-den-text placeholder:text-den-text-dim focus:outline-none focus:border-den-cyan"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full bg-den-surface border border-den-border rounded-lg px-3 py-2 text-sm text-den-text placeholder:text-den-text-dim focus:outline-none focus:border-den-cyan"
          />
          <button
            onClick={createTable}
            disabled={!newName.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-den-cyan to-[#29b6f6] text-den-bg rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-all"
          >
            <Plus size={14} />
            Create
          </button>
        </div>
      )}

      {message && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-[rgba(239,83,80,0.1)] text-den-red border border-den-red/30">
          {message}
        </div>
      )}

      {/* Table list */}
      {tables.length === 0 ? (
        <div className="text-center py-16 text-den-text-dim text-[13px]">
          No loot tables yet. Create one to get started!
        </div>
      ) : (
        tables.map((table) => (
          <div key={table.id} className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="px-5 py-4 border-b border-den-border flex items-center gap-3">
              <button onClick={() => toggleExpand(table.id)} className="text-den-text-muted hover:text-den-text">
                {expanded.has(table.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold truncate">{table.name}</h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      table.isEnabled
                        ? "bg-[rgba(102,187,106,0.15)] text-den-green"
                        : "bg-[rgba(239,83,80,0.15)] text-den-red"
                    }`}
                  >
                    {table.isEnabled ? "ENABLED" : "DISABLED"}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-den-elevated text-den-text-muted border border-den-border">
                    {table.entries.length} items
                  </span>
                </div>
                {table.description && (
                  <p className="text-[11px] text-den-text-dim mt-0.5">{table.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleEnabled(table)}
                  className="text-den-text-muted hover:text-den-text transition-colors"
                  title={table.isEnabled ? "Disable" : "Enable"}
                >
                  {table.isEnabled ? <ToggleRight size={20} className="text-den-green" /> : <ToggleLeft size={20} />}
                </button>
                <button
                  onClick={() => deleteTable(table.id, table.name)}
                  className="text-den-text-dim hover:text-den-red transition-colors"
                  title="Delete table"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* Expanded entries */}
            {expanded.has(table.id) && (
              <div className="p-3">
                <EntryList serverId={serverId} tableId={table.id} entries={table.entries} onRefresh={loadTables} />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ======== ENTRY LIST (sub-component) ========

function EntryList({
  serverId,
  tableId,
  entries,
  onRefresh,
}: {
  serverId: string;
  tableId: number;
  entries: LootEntry[];
  onRefresh: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ itemName: "", minQuantity: 1, maxQuantity: 1, weight: 10 });

  const resetForm = () => setForm({ itemName: "", minQuantity: 1, maxQuantity: 1, weight: 10 });

  const addEntry = async () => {
    if (!form.itemName.trim()) return;
    await fetch(`/api/airdrops/loot-tables?server=${serverId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-entry", lootTableId: tableId, ...form, itemName: form.itemName.trim() }),
    });
    resetForm();
    setShowAdd(false);
    onRefresh();
  };

  const updateEntry = async () => {
    if (!form.itemName.trim() || !editingId) return;
    await fetch(`/api/airdrops/loot-tables?server=${serverId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-entry", id: editingId, ...form, itemName: form.itemName.trim() }),
    });
    setEditingId(null);
    resetForm();
    onRefresh();
  };

  const deleteEntry = async (id: number) => {
    await fetch(`/api/airdrops/loot-tables?server=${serverId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-entry", id }),
    });
    onRefresh();
  };

  const startEdit = (entry: LootEntry) => {
    setEditingId(entry.id);
    setForm({
      itemName: entry.itemName,
      minQuantity: entry.minQuantity,
      maxQuantity: entry.maxQuantity,
      weight: entry.weight,
    });
    setShowAdd(false);
  };

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);

  return (
    <div className="space-y-2">
      {/* Entry rows */}
      {entries.length === 0 && !showAdd && (
        <div className="text-center py-6 text-den-text-dim text-[12px]">No items yet</div>
      )}

      {entries.map((entry) =>
        editingId === entry.id ? (
          <EntryForm
            key={entry.id}
            form={form}
            setForm={setForm}
            onSubmit={updateEntry}
            onCancel={() => {
              setEditingId(null);
              resetForm();
            }}
            submitLabel="Save"
          />
        ) : (
          <div
            key={entry.id}
            className="flex items-center gap-3 px-3 py-2.5 bg-den-surface rounded-md border border-transparent hover:border-den-border transition-colors group"
          >
            <Package size={14} className="text-den-text-dim shrink-0" />
            <span className="text-xs font-semibold flex-1 min-w-0 truncate">{entry.itemName}</span>
            <span className="text-[11px] text-den-text-dim whitespace-nowrap">
              {entry.minQuantity === entry.maxQuantity
                ? `x${entry.minQuantity}`
                : `x${entry.minQuantity}-${entry.maxQuantity}`}
            </span>
            <div className="flex items-center gap-1.5 w-24">
              <div className="flex-1 h-1.5 bg-den-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-den-cyan rounded-full"
                  style={{ width: totalWeight > 0 ? `${(entry.weight / totalWeight) * 100}%` : "0%" }}
                />
              </div>
              <span className="text-[10px] text-den-text-dim w-6 text-right">{entry.weight}</span>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => startEdit(entry)} className="text-den-text-dim hover:text-den-cyan" title="Edit">
                <Pencil size={13} />
              </button>
              <button onClick={() => deleteEntry(entry.id)} className="text-den-text-dim hover:text-den-red" title="Delete">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )
      )}

      {/* Add entry form */}
      {showAdd && (
        <EntryForm
          form={form}
          setForm={setForm}
          onSubmit={addEntry}
          onCancel={() => {
            setShowAdd(false);
            resetForm();
          }}
          submitLabel="Add"
        />
      )}

      {/* Add button */}
      {!showAdd && editingId === null && (
        <button
          onClick={() => {
            resetForm();
            setShowAdd(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-den-cyan hover:bg-den-cyan-glow rounded-md transition-colors"
        >
          <Plus size={13} />
          Add Item
        </button>
      )}
    </div>
  );
}

// ======== ENTRY FORM (shared for add/edit) ========

function EntryForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  form: { itemName: string; minQuantity: number; maxQuantity: number; weight: number };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-den-elevated rounded-md border border-den-cyan/20">
      <input
        type="text"
        placeholder="Item name"
        value={form.itemName}
        onChange={(e) => setForm({ ...form, itemName: e.target.value })}
        className="flex-1 min-w-[140px] bg-den-surface border border-den-border rounded px-2 py-1.5 text-xs text-den-text placeholder:text-den-text-dim focus:outline-none focus:border-den-cyan"
      />
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-den-text-dim">Min</label>
        <input
          type="number"
          min={1}
          value={form.minQuantity}
          onChange={(e) => setForm({ ...form, minQuantity: parseInt(e.target.value) || 1 })}
          className="w-14 bg-den-surface border border-den-border rounded px-2 py-1.5 text-xs text-den-text focus:outline-none focus:border-den-cyan"
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-den-text-dim">Max</label>
        <input
          type="number"
          min={1}
          value={form.maxQuantity}
          onChange={(e) => setForm({ ...form, maxQuantity: parseInt(e.target.value) || 1 })}
          className="w-14 bg-den-surface border border-den-border rounded px-2 py-1.5 text-xs text-den-text focus:outline-none focus:border-den-cyan"
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-den-text-dim">Weight</label>
        <input
          type="number"
          min={1}
          value={form.weight}
          onChange={(e) => setForm({ ...form, weight: parseInt(e.target.value) || 1 })}
          className="w-14 bg-den-surface border border-den-border rounded px-2 py-1.5 text-xs text-den-text focus:outline-none focus:border-den-cyan"
        />
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={onSubmit}
          disabled={!form.itemName.trim()}
          className="px-3 py-1.5 bg-den-cyan/20 text-den-cyan rounded text-[11px] font-semibold hover:bg-den-cyan/30 disabled:opacity-50 transition-colors"
        >
          {submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-den-text-dim rounded text-[11px] font-semibold hover:bg-den-surface transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ======== SETTINGS TAB ========

const SETTING_LABELS: Record<string, { label: string; type: "toggle" | "number" | "text" | "textarea"; description: string }> = {
  "airdrop.enabled": { label: "Enabled", type: "toggle", description: "Enable or disable automatic airdrops" },
  "airdrop.intervalMinutes": { label: "Interval (minutes)", type: "number", description: "Minutes between automatic drops" },
  "airdrop.chestBlockType": { label: "Chest Block Type", type: "text", description: "Block type used for the airdrop chest" },
  "airdrop.minItems": { label: "Min Items", type: "number", description: "Minimum items per drop" },
  "airdrop.maxItems": { label: "Max Items", type: "number", description: "Maximum items per drop" },
  "airdrop.radiusFromCenter": { label: "Drop Radius", type: "number", description: "Radius around random player (blocks)" },
  "airdrop.centerX": { label: "Center X", type: "number", description: "Legacy - unused (drops target random players)" },
  "airdrop.centerZ": { label: "Center Z", type: "number", description: "Legacy - unused (drops target random players)" },
  "airdrop.containerSlots": { label: "Container Slots", type: "number", description: "Number of chest inventory slots" },
  "airdrop.announceMessage": { label: "Announce Message", type: "textarea", description: "Broadcast template (%x, %y, %z)" },
  "airdrop.untouchedDecayMinutes": { label: "Untouched Decay", type: "number", description: "Minutes before untouched drop disappears" },
  "airdrop.openedDecayMinutes": { label: "Opened Decay", type: "number", description: "Minutes before opened drop disappears" },
};

const SETTING_ORDER = [
  "airdrop.enabled",
  "airdrop.intervalMinutes",
  "airdrop.radiusFromCenter",
  "airdrop.minItems",
  "airdrop.maxItems",
  "airdrop.containerSlots",
  "airdrop.chestBlockType",
  "airdrop.untouchedDecayMinutes",
  "airdrop.openedDecayMinutes",
  "airdrop.announceMessage",
];

function SettingsTab({ serverId }: { serverId: string }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/airdrops/settings?server=${serverId}`);
      const data = await res.json();
      setSettings(data.settings || {});
      setDirty(new Set());
    } catch {
      /* ignore */
    }
  }, [serverId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateLocal = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  };

  const saveAll = async () => {
    setSaving(true);
    setMessage("");
    try {
      for (const key of dirty) {
        await fetch(`/api/airdrops/settings?server=${serverId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: key, value: settings[key] }),
        });
      }
      setDirty(new Set());
      setMessage("Settings saved!");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Save bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={saveAll}
          disabled={dirty.size === 0 || saving}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-den-cyan to-[#29b6f6] text-den-bg rounded-lg text-sm font-semibold hover:brightness-110 hover:shadow-[0_0_16px_rgba(79,195,247,0.3)] disabled:opacity-50 transition-all"
        >
          <Save size={16} />
          Save Changes
          {dirty.size > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-[10px]">{dirty.size}</span>
          )}
        </button>
        {message && (
          <span className="text-sm font-medium text-den-green">{message}</span>
        )}
      </div>

      {/* Settings grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SETTING_ORDER.map((key) => {
          const meta = SETTING_LABELS[key];
          if (!meta) return null;
          const value = settings[key] ?? "";

          return (
            <div
              key={key}
              className={`bg-gradient-to-br from-den-card to-den-surface border rounded-xl p-4 space-y-2 ${
                dirty.has(key) ? "border-den-cyan/40" : "border-den-border"
              } ${meta.type === "textarea" ? "md:col-span-2" : ""}`}
            >
              <div>
                <label className="text-xs font-bold">{meta.label}</label>
                <p className="text-[11px] text-den-text-dim">{meta.description}</p>
              </div>

              {meta.type === "toggle" ? (
                <button
                  onClick={() => updateLocal(key, value === "true" ? "false" : "true")}
                  className="flex items-center gap-2"
                >
                  {value === "true" ? (
                    <ToggleRight size={28} className="text-den-green" />
                  ) : (
                    <ToggleLeft size={28} className="text-den-text-dim" />
                  )}
                  <span className={`text-xs font-semibold ${value === "true" ? "text-den-green" : "text-den-text-dim"}`}>
                    {value === "true" ? "Enabled" : "Disabled"}
                  </span>
                </button>
              ) : meta.type === "textarea" ? (
                <textarea
                  value={value}
                  onChange={(e) => updateLocal(key, e.target.value)}
                  rows={2}
                  className="w-full bg-den-surface border border-den-border rounded-lg px-3 py-2 text-sm text-den-text font-mono placeholder:text-den-text-dim focus:outline-none focus:border-den-cyan resize-none"
                />
              ) : meta.type === "number" ? (
                <input
                  type="number"
                  value={value}
                  onChange={(e) => updateLocal(key, e.target.value)}
                  className="w-full bg-den-surface border border-den-border rounded-lg px-3 py-2 text-sm text-den-text font-mono focus:outline-none focus:border-den-cyan"
                />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateLocal(key, e.target.value)}
                  className="w-full bg-den-surface border border-den-border rounded-lg px-3 py-2 text-sm text-den-text font-mono focus:outline-none focus:border-den-cyan"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ======== HISTORY TAB ========

function HistoryTab({ serverId }: { serverId: string }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/airdrops/history?server=${serverId}`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch {
      /* ignore */
    }
  }, [serverId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
        <h3 className="text-sm font-bold">Drop History</h3>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-den-elevated text-den-text-muted border border-den-border">
          {history.length}
        </span>
      </div>
      <div className="p-3 max-h-[600px] overflow-y-auto">
        {history.length === 0 ? (
          <div className="text-center py-16 text-den-text-dim text-[13px]">No airdrop history yet</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-start gap-3 px-3 py-3 bg-den-surface rounded-md border border-transparent hover:border-den-border transition-colors"
              >
                <Crosshair size={14} className="text-den-cyan shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <MapPin size={11} className="text-den-text-dim" />
                    <span className="font-mono font-semibold">{h.position}</span>
                  </div>
                  {h.item_summary && (
                    <p className="text-[11px] text-den-text-muted mt-1 truncate">{h.item_summary}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-[11px] text-den-text-dim">
                    <Clock size={10} className="inline mr-1" />
                    {formatDate(h.created_at)}
                  </span>
                  {h.loot_table_name && (
                    <span className="text-[10px] text-den-text-dim">{h.loot_table_name}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
