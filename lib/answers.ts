"use client";

// The student's typed answers, kept per book/test/skill. One sheet holds all
// answers of one skill, keyed by question number (or a positional fallback for
// unnumbered gaps — see answerId in app/QuestionGroups.tsx). Stored like the
// skill timer (lib/timers.ts): localStorage via useSyncExternalStore, so the
// sheet is shared across a skill's tabs and survives unmounts.

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Question number (or fallback id) -> what the student wrote. Cleared answers
// are removed, not stored blank.
export type Answers = Record<string, string>;

const EMPTY: Answers = {};
const PREFIX = "p2c:answers:";
// Dispatched after a same-tab write ("storage" only fires in other tabs).
const CHANGED_EVENT = "p2c:answers-changed";

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

function parse(raw: string | null): Answers {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return EMPTY;
    }
    const out: Answers = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "string") out[id] = value;
    }
    return out;
  } catch {
    return EMPTY;
  }
}

// getSnapshot must be referentially stable: cache per key, rebuild only when
// the raw string changes.
const cache = new Map<string, { raw: string | null; value: Answers }>();

function getSnapshot(key: string): Answers {
  const raw = safeGet(key);
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value;
  const value = parse(raw);
  cache.set(key, { raw, value });
  return value;
}

function commit(key: string, value: Answers): void {
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

// One skill's answers, as the question UI reads and writes them.
export type AnswerSheet = {
  get: (id: string) => string;
  set: (id: string, value: string) => void;
  answered: number; // how many gaps have something in them
  all: Answers; // the whole sheet at once, to mark against the book's key
};

// The answer sheet for one skill of one test, backed by localStorage.
export function useAnswers(
  bookId: string,
  test: number,
  skill: string,
): AnswerSheet {
  const key = keyFor(bookId, test, skill);

  const answers = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(key, cb), [key]),
    useCallback(() => getSnapshot(key), [key]),
    () => EMPTY, // server snapshot: an empty sheet
  );

  const get = useCallback((id: string) => answers[id] ?? "", [answers]);

  const set = useCallback(
    (id: string, value: string) => {
      const current = getSnapshot(key);
      if ((current[id] ?? "") === value) return;
      const next = { ...current };
      if (value === "") delete next[id];
      else next[id] = value;
      commit(key, next);
    },
    [key],
  );

  const answered = useMemo(
    () => Object.values(answers).filter((v) => v.trim() !== "").length,
    [answers],
  );

  return useMemo(
    () => ({ get, set, answered, all: answers }),
    [get, set, answered, answers],
  );
}
