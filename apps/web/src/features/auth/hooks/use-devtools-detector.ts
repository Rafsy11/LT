'use client';

import { useState, useEffect, useCallback } from 'react';

const DEVTOOLS_DIMENSION_THRESHOLD = 160;
const MOBILE_BREAKPOINT_PX = 768;
const POLL_INTERVAL_MS = 750;

export interface DevToolsDetectorState {
  /** True only when mobile viewport/device is active AND DevTools is currently open. */
  isBlocked: boolean;
  /** Whether the current browser viewport matches mobile dimensions. */
  isMobileViewport: boolean;
  /** Manually re-run detection probe on demand. */
  recheck: () => void;
}

function isInputCurrentlyFocused(): boolean {
  if (typeof document === 'undefined' || !document.activeElement) return false;
  const tag = document.activeElement.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isRealTouchMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    navigator.maxTouchPoints > 0 &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  );
}

function detectInjectedMobileConsole(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const win = window as unknown as Record<string, unknown>;
  if (Boolean(win.eruda) || Boolean(win.VConsole) || Boolean(win.__ERUDA__)) {
    return true;
  }
  return Boolean(document.getElementById('eruda') || document.getElementById('__vconsole'));
}

function detectDockedDevTools(): boolean {
  if (typeof window === 'undefined') return false;
  const widthDelta = Math.max(0, window.outerWidth - window.innerWidth);
  const heightDelta = Math.max(0, window.outerHeight - window.innerHeight);

  if (widthDelta > DEVTOOLS_DIMENSION_THRESHOLD) {
    return true;
  }

  // Skip vertical height delta on touch phones while an input is focused so soft keyboards never false-trigger
  const softKeyboardLikelyOpen = isRealTouchMobileDevice() && isInputCurrentlyFocused();
  if (!softKeyboardLikelyOpen && heightDelta > DEVTOOLS_DIMENSION_THRESHOLD) {
    return true;
  }

  return false;
}

function detectConsoleObjectInspection(): boolean {
  if (typeof document === 'undefined') return false;
  let inspected = false;
  const probe = document.createElement('div');
  Object.defineProperty(probe, 'id', {
    get() {
      inspected = true;
      return '';
    },
    configurable: true,
  });
  // Uncoerced DOM probe triggers the id getter only when browser DevTools formats console output
  console.debug(probe);
  return inspected;
}

function evaluateDevToolsState(): { isMobileViewport: boolean; isOpen: boolean } {
  if (typeof window === 'undefined') {
    return { isMobileViewport: false, isOpen: false };
  }

  const isMobileViewport = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  if (!isMobileViewport) {
    return { isMobileViewport: false, isOpen: false };
  }

  if (detectInjectedMobileConsole() || detectDockedDevTools()) {
    return { isMobileViewport: true, isOpen: true };
  }

  const consoleInspected = detectConsoleObjectInspection();
  return { isMobileViewport: true, isOpen: consoleInspected };
}

/**
 * Reactively monitors browser Developer Tools exclusively on mobile viewports.
 * Returns `isBlocked = true` only while DevTools is open, clearing automatically when closed.
 */
export function useMobileDevToolsGuard(): DevToolsDetectorState {
  const [state, setState] = useState<{ isBlocked: boolean; isMobileViewport: boolean }>({
    isBlocked: false,
    isMobileViewport: false,
  });

  const recheck = useCallback(() => {
    const next = evaluateDevToolsState();
    setState((prev) =>
      prev.isBlocked === next.isOpen && prev.isMobileViewport === next.isMobileViewport
        ? prev
        : { isBlocked: next.isOpen, isMobileViewport: next.isMobileViewport },
    );
  }, []);

  useEffect(() => {
    recheck();

    const handleResize = () => {
      recheck();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isDevToolsShortcut =
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase()));

      if (isDevToolsShortcut && window.innerWidth <= MOBILE_BREAKPOINT_PX) {
        window.setTimeout(recheck, 120);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    const intervalId = window.setInterval(recheck, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.clearInterval(intervalId);
    };
  }, [recheck]);

  return {
    isBlocked: state.isBlocked,
    isMobileViewport: state.isMobileViewport,
    recheck,
  };
}
