"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useBook } from "@/lib/books";

// Test selection for one saved book: the practice tests it was split into,
// read from IndexedDB by the id in the URL.
export default function TestSelectionPage() {
  const params = useParams<{ bookId: string }>();
  const { loading, book } = useBook(params.bookId);

  const tests = book?.tests ?? [];

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Select a test</h1>
        <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
      </main>
    );
  }

  if (!book || tests.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Select a test</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          This book couldn&apos;t be found. It may have been deleted.
        </p>
        <Link
          href="/tests"
          className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Back to saved books
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Select a test</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {book.name || "Untitled book"}
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {tests.map((test) => (
          <Link
            key={test}
            href={`/tests/${book.id}/${test}`}
            className="flex flex-col gap-1 rounded-xl border border-black/15 p-6 transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            <span className="text-lg font-semibold tracking-tight">
              Test {test}
            </span>
            <span className="text-sm text-black/50 dark:text-white/50">
              Listening · Reading · Writing
            </span>
          </Link>
        ))}
      </div>

      <Link
        href="/tests"
        className="w-fit text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
      >
        ← Back to saved books
      </Link>
    </main>
  );
}
