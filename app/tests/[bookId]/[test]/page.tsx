"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Section, TestPart } from "@/lib/pdf";
import { useBook } from "@/lib/books";
import { OFFERED_SECTIONS, sectionToSlug } from "@/lib/sections";

// How long each section runs, shown as a note on its card.
const SECTION_DURATIONS: Record<Section, string> = {
  Listening: "30 minutes",
  Reading: "1 hour",
  Writing: "1 hour",
  Speaking: "",
};

// The hub for one test: each section (Listening / Reading / Writing) is its own
// page with its own timer, so this page just links out to them. Sections missing
// from the uploaded book are shown but disabled. The book is loaded from
// IndexedDB by the id in the URL, so this page refreshes and deep-links cleanly.
export default function TestPage() {
  const params = useParams<{ bookId: string; test: string }>();
  const testNum = Number(params.test);
  const { loading, book } = useBook(params.bookId);

  // Which sections this test actually has text for, keyed for quick lookup.
  const bySection = useMemo(() => {
    const map = new Map<Section, TestPart>();
    for (const p of book?.parts ?? []) {
      if (p.test === testNum && p.section) map.set(p.section, p);
    }
    return map;
  }, [book, testNum]);

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Test {params.test}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
      </main>
    );
  }

  if (!book || !OFFERED_SECTIONS.some((s) => bySection.has(s))) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Test {params.test}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Nothing to show for this test. The book may have been deleted, or this
          test wasn&apos;t found in it.
        </p>
        <Link
          href={`/tests/${params.bookId}`}
          className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Back to test selection
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Test {testNum}</h1>
      </header>

      <div className="flex flex-col gap-4">
        {OFFERED_SECTIONS.map((s) => {
          const available = bySection.has(s);

          if (!available) {
            return (
              <div
                key={s}
                className="flex cursor-not-allowed flex-col gap-1 rounded-xl border border-black/15 p-6 opacity-40 dark:border-white/20"
              >
                <span className="text-lg font-semibold tracking-tight">{s}</span>
                <span className="text-sm text-black/50 dark:text-white/50">
                  Not in this book
                </span>
              </div>
            );
          }

          return (
            <Link
              key={s}
              href={`/tests/${params.bookId}/${params.test}/${sectionToSlug(s)}`}
              className="flex flex-col gap-1 rounded-xl border border-black/15 p-6 transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              <span className="text-lg font-semibold tracking-tight">{s}</span>
              <span className="text-sm text-black/50 dark:text-white/50">
                {SECTION_DURATIONS[s]}
              </span>
            </Link>
          );
        })}
      </div>

      <Link
        href={`/tests/${params.bookId}`}
        className="w-fit text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
      >
        ← Back to test selection
      </Link>
    </main>
  );
}
