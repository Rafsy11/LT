'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatRateLimitDuration } from '@/lib/error-dictionary';

export interface RateLimitCountdownState {
  /** Remaining cooldown time in whole seconds (`0` when unlocked). */
  remainingSeconds: number;
  /** True while action should remain disabled due to HTTP 429 cooldown. */
  isLimited: boolean;
  /** Human-readable Indonesian countdown label (e.g., `45 detik`, `14 menit 55 detik`, `1 jam 5 menit`). */
  formattedTime: string;
  /** Starts or updates the cooldown timer from `Retry-After` seconds. */
  startCooldown: (seconds: number) => void;
  /** Immediately resets the cooldown timer to zero. */
  clearCooldown: () => void;
}

const MS_PER_SECOND = 1000;

function readStoredExpiresAt(storageKey?: string): number | null {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= Date.now()) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredExpiresAt(storageKey: string | undefined, expiresAt: number | null): void {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    if (expiresAt === null) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, String(expiresAt));
    }
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

/**
 * Reusable countdown hook for HTTP 429 Too Many Requests responses.
 * Optionally persists the expiration timestamp in `localStorage` so the UI countdown
 * survives browser refreshes without SSR hydration mismatches.
 *
 * @param initialSeconds - Optional initial cooldown duration in seconds.
 * @param storageKey - Optional `localStorage` key used to persist cooldown across page reloads.
 * @returns Countdown state and control helpers.
 * @example
 * const { remainingSeconds, isLimited, startCooldown } = useRateLimitCountdown(0, 'login_rate_limit_until');
 */
export function useRateLimitCountdown(
  initialSeconds = 0,
  storageKey?: string,
): RateLimitCountdownState {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() =>
    Math.max(0, Math.ceil(initialSeconds)),
  );
  const expiresAtRef = useRef<number | null>(
    initialSeconds > 0 ? Date.now() + Math.ceil(initialSeconds) * MS_PER_SECOND : null,
  );

  // Restore persisted cooldown timestamp on client mount & sync across tabs
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;

    const syncFromStorage = () => {
      const storedExpiresAt = readStoredExpiresAt(storageKey);
      if (storedExpiresAt) {
        expiresAtRef.current = storedExpiresAt;
        const left = Math.max(0, Math.ceil((storedExpiresAt - Date.now()) / MS_PER_SECOND));
        setRemainingSeconds(left);
      } else {
        expiresAtRef.current = null;
        setRemainingSeconds(0);
      }
    };

    syncFromStorage();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        syncFromStorage();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey]);

  const hasCooldown = remainingSeconds > 0;

  useEffect(() => {
    if (!hasCooldown) return;

    const timerId = window.setInterval(() => {
      if (expiresAtRef.current !== null) {
        const nextSeconds = Math.max(
          0,
          Math.ceil((expiresAtRef.current - Date.now()) / MS_PER_SECOND),
        );
        if (nextSeconds <= 0) {
          expiresAtRef.current = null;
          writeStoredExpiresAt(storageKey, null);
        }
        setRemainingSeconds(nextSeconds);
      } else {
        setRemainingSeconds((prev) => {
          const next = prev <= 1 ? 0 : prev - 1;
          if (next === 0) {
            writeStoredExpiresAt(storageKey, null);
          }
          return next;
        });
      }
    }, MS_PER_SECOND);

    return () => window.clearInterval(timerId);
  }, [hasCooldown, storageKey]);

  const startCooldown = useCallback(
    (seconds: number) => {
      const normalized = Math.max(1, Math.ceil(seconds));
      const expiresAt = Date.now() + normalized * MS_PER_SECOND;
      expiresAtRef.current = expiresAt;
      writeStoredExpiresAt(storageKey, expiresAt);
      setRemainingSeconds(normalized);
    },
    [storageKey],
  );

  const clearCooldown = useCallback(() => {
    expiresAtRef.current = null;
    writeStoredExpiresAt(storageKey, null);
    setRemainingSeconds(0);
  }, [storageKey]);

  const formattedTime = useMemo(
    () => (remainingSeconds > 0 ? formatRateLimitDuration(remainingSeconds) : '0 detik'),
    [remainingSeconds],
  );

  return {
    remainingSeconds,
    isLimited: remainingSeconds > 0,
    formattedTime,
    startCooldown,
    clearCooldown,
  };
}
