/**
 * Tracks whether any form on screen holds unsaved edits, so in-app
 * navigation (tabs, sidebar) can ask before throwing them away.
 * Page reloads and closes are covered by a beforeunload listener in the
 * form itself; this covers client-side route changes, which don't fire it.
 */

const dirty = new Set<string>();

export function setUnsaved(key: string, isDirty: boolean) {
  if (isDirty) dirty.add(key);
  else dirty.delete(key);
}

export function hasUnsaved(): boolean {
  return dirty.size > 0;
}

/** True when it's fine to navigate away (nothing dirty, or the user agreed). */
export function confirmDiscard(): boolean {
  if (dirty.size === 0) return true;
  const ok = window.confirm("You have unsaved changes. Leave without saving?");
  if (ok) dirty.clear();
  return ok;
}
