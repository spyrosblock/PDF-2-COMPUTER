"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Skill, TestSkill } from "@/lib/pdf";
import { useBook } from "@/lib/books";
import { OFFERED_SKILLS, skillToSlug } from "@/lib/skills";
import { ThemeToggle } from "@/app/ThemeToggle";

// How long each skill runs, shown as a note on its card.
const SKILL_DURATIONS: Record<Skill, string> = {
  Listening: "30 minutes",
  Reading: "1 hour",
  Writing: "1 hour",
  Speaking: "",
};

// The hub for one test: links out to each skill's own page (each with its own
// timer). Skills missing from the book are shown but disabled.
export default function TestPage() {
  const params = useParams<{ bookId: string; test: string }>();
  const testNum = Number(params.test);
  const { loading, book } = useBook(params.bookId);

  // Which skills this test actually has text for, keyed for quick lookup.
  const bySkill = useMemo(() => {
    const map = new Map<Skill, TestSkill>();
    for (const s of book?.skills ?? []) {
      if (s.test === testNum && s.skill) map.set(s.skill, s);
    }
    return map;
  }, [book, testNum]);

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Test {params.test}
          </h1>
          <ThemeToggle />
        </header>
        <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
      </main>
    );
  }

  if (!book || !OFFERED_SKILLS.some((s) => bySkill.has(s))) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Test {params.test}
          </h1>
          <ThemeToggle />
        </header>
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Test {testNum}</h1>
        <ThemeToggle />
      </header>

      <div className="flex flex-col gap-4">
        {OFFERED_SKILLS.map((s) => {
          const available = bySkill.has(s);

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
              href={`/tests/${params.bookId}/${params.test}/${skillToSlug(s)}`}
              className="flex flex-col gap-1 rounded-xl border border-black/15 p-6 transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              <span className="text-lg font-semibold tracking-tight">{s}</span>
              <span className="text-sm text-black/50 dark:text-white/50">
                {SKILL_DURATIONS[s]}
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
