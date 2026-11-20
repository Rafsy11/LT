'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface RateLimitCountdownState {
  /** Remaining cooldown time in whole seconds (`0` when unlocked). */
  remainingSeconds: number;
  /** True while action should remain disabled due to HTTP 429 cooldown. */
  isLimited: boolean;
  /** Human-readable Indonesian countdown label (e.g., `45 detik`, `1 menit 15 detik`). */
  formattedTime: string;
  /** Starts or updates the cooldown timer from `Retry-After` seconds. */
  startCooldown: (seconds: number) => void;
  /** Immediately resets the cooldown timer to zero. */
  clearCooldown: () => void;
}

function formatDurationIndonesian(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  if (safe < 60) {
    return `${safe} detik`;
  }
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return secs > 0 ? `${mins} menit ${secs} detik` : `${mins} menit`;
}

/**
 * Reusable countdown hook for HTTP 429 Too Many Requests responses.
 * Automatically decrements every second and unlocks actions when cooldown completes.
 *
 * @param initialSeconds - Optional initial cooldown duration in seconds.
 * @returns Countdown state and control helpers.
 * @example
 * const { remainingSeconds, isLimited, startCooldown } = useRateLimitCountdown();
 */
export function useRateLimitCountdown(initialSeconds = 0): RateLimitCountdownState {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() =>
    Math.max(0, Math.ceil(initialSeconds)),
  );

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timerId = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [remainingSeconds > 0]);

  const startCooldown = useCallback((seconds: number) => {
    const normalized = Math.max(1, Math.ceil(seconds));
    setRemainingSeconds(normalized);
  }, []);

  const clearCooldown = useCallback(() => {
    setRemainingSeconds(0);
  }, []);

  const formattedTime = useMemo(
    () => formatDurationIndonesian(remainingSeconds),
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
