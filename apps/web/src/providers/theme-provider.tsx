'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'fiberops_theme';

function parseStoredTheme(raw: string | null): Theme {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncColorSchemeMeta(themePref: Theme) {
  if (typeof document === 'undefined' || !document.head) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head.prepend(meta);
  }
  meta.content = themePref === 'system' ? 'light dark' : themePref;
}

function applyThemeToDOM(themePref: Theme, resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  syncColorSchemeMeta(themePref);
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    try {
      const initialTheme = parseStoredTheme(localStorage.getItem(THEME_STORAGE_KEY));
      const actualResolved = initialTheme === 'system' ? getSystemTheme() : initialTheme;

      setThemeState(initialTheme);
      setResolvedTheme(actualResolved);
      applyThemeToDOM(initialTheme, actualResolved);
    } catch {
      applyThemeToDOM('system', getSystemTheme());
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (theme === 'system') {
        const nextResolved: ResolvedTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(nextResolved);
        applyThemeToDOM('system', nextResolved);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
      const syncedTheme = parseStoredTheme(e.newValue);
      const nextResolved = syncedTheme === 'system' ? getSystemTheme() : syncedTheme;
      setThemeState(syncedTheme);
      setResolvedTheme(nextResolved);
      applyThemeToDOM(syncedTheme, nextResolved);
    };

    window.addEventListener('storage', handleStorageChange);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemChange);
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        mediaQuery.removeEventListener('change', handleSystemChange);
      };
    } else {
      mediaQuery.addListener(handleSystemChange);
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        mediaQuery.removeListener(handleSystemChange);
      };
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    const nextResolved = newTheme === 'system' ? getSystemTheme() : newTheme;
    setThemeState(newTheme);
    setResolvedTheme(nextResolved);
    applyThemeToDOM(newTheme, nextResolved);
    try {
      if (newTheme === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme: Theme =
      theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(nextTheme);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'system' as Theme,
      resolvedTheme: 'light' as ResolvedTheme,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return context;
}

