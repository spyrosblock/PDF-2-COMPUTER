"use client";

// Per-skill stopwatch backed by localStorage. Stores accumulated time plus the
// epoch timestamp of the current run, so a running timer keeps counting across a
// reload. Read through useSyncExternalStore: hydration-safe and in sync across
// pages sharing a key.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type TimerState = {
  // Time accumulated across previous runs, in ms (excludes the current run).
  elapsedMs: number;
  running: boolean;
  // Epoch ms when the current run started; only meaningful while running.
  lastStartedAt: number;
};

const ZERO: TimerState = { elapsedMs: 0, running: false, lastStartedAt: 0 };
const PREFIX = "p2c:timer:";
// Dispatched after a same-tab write ("storage" only fires in other tabs).
const CHANGED_EVENT = "p2c:timer-changed";

function keyFor(bookId: string, test: number, skill: string): string {
  return `${PREFIX}${bookId}:${test}:${skill.toLowerCase()}`;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw: string | null): TimerState {
  if (!raw) return ZERO;
  try {
    const p = JSON.parse(raw) as Partial<TimerState>;
    if (typeof p.elapsedMs !== "number") return ZERO;
    return {
      elapsedMs: p.elapsedMs,
      running: !!p.running,
      lastStartedAt: typeof p.lastStartedAt === "number" ? p.lastStartedAt : 0,
    };
  } catch {
    return ZERO;
  }
}

// getSnapshot must be referentially stable: cache per key, rebuild only when
// the raw string changes.
const cache = new Map<string, { raw: string | null; value: TimerState }>();

function getSnapshot(key: string): TimerState {
  const raw = safeGet(key);
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value;
  const value = parse(raw);
  cache.set(key, { raw, value });
  return value;
}

function commit(key: string, value: TimerState): void {
  const raw = JSON.stringify(value);
  try {
    localStorage.setItem(key, raw);
  } catch {
    // Storage unavailable: works for the session via the cache, just won't persist.
  }
  cache.set(key, { raw, value });
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: key }));
}

function subscribe(key: string, callback: () => void): () => void {
  const onLocal = (e: Event) => {
    if ((e as CustomEvent<string>).detail === key) callback();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) {
      cache.delete(key); // force a re-parse from the other tab's write
      callback();
    }
  };
  window.addEventListener(CHANGED_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

// Format a duration in ms as MM:SS, widening to H:MM:SS once it passes an hour.
export function formatDuration(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export type SkillTimer = {
  running: boolean;
  elapsedMs: number; // live value, including the current run
  start: () => void;
  stop: () => void;
  reset: () => void;
};

// Start/stop stopwatch for one test skill, backed by localStorage.
export function useSkillTimer(
  bookId: string,
  test: number,
  skill: string,
): SkillTimer {
  const key = keyFor(bookId, test, skill);

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(key, cb), [key]),
    useCallback(() => getSnapshot(key), [key]),
    () => ZERO, // server snapshot: 00:00, stopped
  );

  // While running, tick a few times a second so the display advances.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state.running]);

  const start = useCallback(() => {
    const cur = getSnapshot(key);
    if (cur.running) return;
    commit(key, { ...cur, running: true, lastStartedAt: Date.now() });
  }, [key]);

  const stop = useCallback(() => {
    const cur = getSnapshot(key);
    if (!cur.running) return;
    const add = Math.max(0, Date.now() - cur.lastStartedAt);
    commit(key, { elapsedMs: cur.elapsedMs + add, running: false, lastStartedAt: 0 });
  }, [key]);

  const reset = useCallback(() => {
    commit(key, { ...ZERO });
  }, [key]);

  const elapsedMs =
    state.elapsedMs +
    (state.running && now ? Math.max(0, now - state.lastStartedAt) : 0);

  return { running: state.running, elapsedMs, start, stop, reset };
}
