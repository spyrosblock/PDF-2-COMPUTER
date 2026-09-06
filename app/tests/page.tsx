"use client";

import { useState } from "react";
import Link from "next/link";
import { useBooks, deleteBook, type BookMeta } from "@/lib/books";
import { ThemeToggle } from "@/app/ThemeToggle";

// Library of saved books, newest first: open or delete one. Nothing stored yet
// drops to an "upload first" state.
export default function LibraryPage() {
  const { books } = useBooks();

  // Loading (books === null) and empty render the same simple prompt.
  if (!books || books.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Saved books</h1>
          <ThemeToggle />
        </header>
        <p className="text-sm text-black/60 dark:text-white/60">
          {books === null
            ? "Loading your saved books…"
            : "No saved books yet. Upload a practice PDF to get started."}
        </p>
        <Link
          href="/"
          className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Go to upload
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Saved books</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Pick a book to choose a test, or delete ones you no longer need.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <Link
            href="/"
            className="w-fit rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Upload another
          </Link>
        </div>
      </header>

      <ul className="flex flex-col gap-3">
        {books.map((book) => (
          <BookRow key={book.id} book={book} />
        ))}
      </ul>
    </main>
  );
}

function BookRow({ book }: { book: BookMeta }) {
  const [deleting, setDeleting] = useState(false);

  const onDelete = async () => {
    if (!window.confirm(`Delete “${book.name}” and all its tests?`)) return;
    setDeleting(true);
    try {
      await deleteBook(book.id);
      // The list refreshes via the store's change event; this row unmounts.
    } catch {
      setDeleting(false);
    }
  };

  const testCount = book.tests.length;
  const savedOn = new Date(book.createdAt).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-black/15 p-4 dark:border-white/20">
      <Link
        href={`/tests/${book.id}`}
        className="flex flex-1 flex-col gap-0.5 rounded-lg -m-2 p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      >
        <span className="truncate text-base font-semibold tracking-tight">
          {book.name || "Untitled book"}
        </span>
        <span className="text-xs text-black/50 dark:text-white/50">
          {testCount} test{testCount === 1 ? "" : "s"} · saved {savedOn}
        </span>
      </Link>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="shrink-0 rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-white/20 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </li>
  );
}
