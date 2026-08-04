import { useEffect, useRef } from "react";

export function loadWizardDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function clearWizardDraft(key: string): void {
  window.localStorage.removeItem(key);
}

export function useWizardAutosave<T>(
  key: string,
  state: T,
  opts: { enabled: boolean; debounceMs?: number; onFirstSave?: () => void },
) {
  const { enabled, debounceMs = 600, onFirstSave } = opts;
  const hasSavedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const handle = window.setTimeout(() => {
      window.localStorage.setItem(key, JSON.stringify(state));
      if (!hasSavedRef.current) {
        hasSavedRef.current = true;
        onFirstSave?.();
      }
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [enabled, key, state, debounceMs, onFirstSave]);
}
