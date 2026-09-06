"use client";

import { useCallback, useSyncExternalStore } from "react";
import { applyTheme, readTheme, saveTheme, type Theme } from "@/lib/theme";

// The theme lives in localStorage, so it's an external store: read once and
// cached here (a stable snapshot), with the toggle below as its only writer.
const listeners = new Set<() => void>();
let snapshot: Theme | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme | null {
  if (snapshot === null) snapshot = readTheme();
  return snapshot;
}

// The server can't see localStorage, so the control renders with nothing
// selected until the client's snapshot lands right after hydration.
function getServerSnapshot(): Theme | null {
  return null;
}

// The stamp on <html> is already right when this mounts (the inline script in
// the layout did it); the state here only mirrors what was stored.
function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    snapshot = next;
    saveTheme(next);
    applyTheme(next);
    for (const listener of listeners) listener();
  }, []);

  return { theme, setTheme };
}

// Light and dark as a small segmented control, sized to sit beside the pill
// buttons in a page header.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-black/15 p-0.5 dark:border-white/20"
    >
      {(["light", "dark"] as const).map((value) => {
        const active = theme === value;
        const label = value === "light" ? "Light" : "Dark";
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={
              "rounded-full p-1.5 transition-colors " +
              (active
                ? "bg-foreground text-background"
                : "text-black/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10")
            }
          >
            {value === "light" ? <SunIcon /> : <MoonIcon />}
          </button>
        );
      })}
    </div>
  );
}

// 14px line icons, drawn in the current text colour.
function SunIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="h-3.5 w-3.5"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}
