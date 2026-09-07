import { useEffect, useState } from "react";

/** Like useState, but backed by localStorage so the value survives a page refresh. */
export function usePersistedState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      // Ignore storage errors (e.g. private browsing mode).
    }
  }, [key, value]);

  return [value, setValue] as const;
}
