"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readStored, subscribeStored, writeStored } from "@/lib/stored";

/**
 * A stored preference. Reads as null on the server and during hydration, so
 * the first client render matches the server HTML, then picks up the stored
 * value without a setState-in-effect round trip.
 */
export function useStoredItem(key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribeStored,
    () => readStored(key),
    () => null,
  );
  const set = useCallback((v: string) => writeStored(key, v), [key]);
  return [value, set];
}
