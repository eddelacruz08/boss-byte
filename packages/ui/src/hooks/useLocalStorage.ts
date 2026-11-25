import { useCallback, useEffect, useState } from 'react';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    // Storage can be blocked (private mode) or hold a value we did not write.
    return fallback;
  }
}

/**
 * `useState` persisted to localStorage as JSON. Falls back to in-memory state
 * when storage is unavailable, and stays in sync across tabs.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((current: T) => T)) => void, () => void] {
  // Callers usually pass a literal, which is a new object every render; keep the first one.
  const [fallback] = useState(initialValue);
  const [value, setValue] = useState<T>(() => read(key, fallback));

  const set = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = next instanceof Function ? next(current) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Quota exceeded or storage blocked: keep the in-memory value.
        }
        return resolved;
      });
    },
    [key],
  );

  const remove = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    setValue(fallback);
  }, [key, fallback]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setValue(read(key, fallback));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, fallback]);

  return [value, set, remove];
}
