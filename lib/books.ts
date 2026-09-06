"use client";

// Persistent store for uploaded books: each PDF is split into its TestSkills
// in the browser (see lib/pdf) and kept in IndexedDB, so it survives reloads
// and the student can keep several books around.

import { useCallback, useEffect, useState } from "react";
import type { TestSkill } from "./pdf";

const DB_NAME = "p2c";
const DB_VERSION = 1;
const STORE = "books";

// Broadcast after any write so open list views re-read (in-tab only).
const CHANGED_EVENT = "p2c:books-changed";

// Book summary for the library view, without the large extracted text.
export type BookMeta = {
  id: string;
  name: string; // the uploaded file's name
  createdAt: number; // epoch ms
  tests: number[]; // distinct test numbers, ascending
};

// A full book record as persisted: its metadata plus the split skills.
export type StoredBook = BookMeta & { skills: TestSkill[] };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // Keyed by the book id we generate on save.
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Resolves on transaction commit, so callers know the write is durable.
function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        let result: T;
        req.onsuccess = () => {
          result = req.result;
        };
        t.oncomplete = () => {
          db.close();
          resolve(result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

function distinctTests(skills: TestSkill[]): number[] {
  return [...new Set(skills.map((s) => s.test))].sort((a, b) => a - b);
}

// Persist a freshly split book and return its generated id.
export async function saveBook(
  name: string,
  skills: TestSkill[],
): Promise<string> {
  const book: StoredBook = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    tests: distinctTests(skills),
    skills,
  };
  await tx("readwrite", (s) => s.put(book));
  window.dispatchEvent(new Event(CHANGED_EVENT));
  return book.id;
}

// Load a single book with its skills, or null if the id isn't stored.
export async function getBook(id: string): Promise<StoredBook | null> {
  const book = await tx<StoredBook | undefined>("readonly", (s) => s.get(id));
  return book ?? null;
}

// All stored books as metadata (no skills), newest first.
export async function listBooks(): Promise<BookMeta[]> {
  const all = await tx<StoredBook[]>("readonly", (s) => s.getAll());
  return all
    .map(({ id, name, createdAt, tests }) => ({ id, name, createdAt, tests }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteBook(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

// Library hook: stored books (null while loading), synced via the change event.
export function useBooks(): { books: BookMeta[] | null; reload: () => void } {
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const reload = useCallback(() => {
    listBooks()
      .then(setBooks)
      .catch(() => setBooks([]));
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener(CHANGED_EVENT, reload);
    return () => window.removeEventListener(CHANGED_EVENT, reload);
  }, [reload]);
  return { books, reload };
}

// Single-book hook. `loading` starts true so pages hold their empty state
// until IndexedDB answers.
export function useBook(id: string | null): {
  loading: boolean;
  book: StoredBook | null;
} {
  const [state, setState] = useState<{
    loading: boolean;
    book: StoredBook | null;
  }>({ loading: !!id, book: null });

  // Reset to "loading" during render when the requested id changes, so the
  // effect only does the async fetch.
  const [trackedId, setTrackedId] = useState(id);
  if (id !== trackedId) {
    setTrackedId(id);
    setState({ loading: !!id, book: null });
  }

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getBook(id)
      .then((book) => alive && setState({ loading: false, book }))
      .catch(() => alive && setState({ loading: false, book: null }));
    return () => {
      alive = false;
    };
  }, [id]);

  return state;
}
