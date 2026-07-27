"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Section, TestPart } from "@/lib/pdf";
import { useBook } from "@/lib/books";
import { slugToSection } from "@/lib/sections";
import { useSectionTimer, formatDuration } from "@/lib/timers";
import { FormattedText } from "@/app/FormattedText";

// One section of a test (Listening, Reading, or Writing) on its own page. It
// shows the section's extracted text and a start/stop timer that the student
// controls themselves; the timer is persisted per book/test/section, so it
// survives navigation and reloads. The book is loaded from IndexedDB by the id
// in the URL, and the section comes from the URL slug.
export default function SectionPage() {
  const params = useParams<{ bookId: string; test: string; section: string }>();
  const testNum = Number(params.test);
  const section = slugToSection(params.section);
  const { loading, book } = useBook(params.bookId);

  // The extracted part for this test + section, if the book has one.
  const part = useMemo<TestPart | undefined>(() => {
    if (!section) return undefined;
    return (book?.parts ?? []).find(
      (p) => p.test === testNum && p.section === section,
    );
  }, [book, testNum, section]);

  if (!section) {
    return (
      <Shell testNum={testNum} bookId={params.bookId} title="Unknown section">
        <p className="text-sm text-black/60 dark:text-white/60">
          &ldquo;{params.section}&rdquo; isn&apos;t a section of this test.
        </p>
        <BackToTest bookId={params.bookId} />
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell testNum={testNum} bookId={params.bookId} title={section}>
        <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
      </Shell>
    );
  }

  return (
    <Shell testNum={testNum} bookId={params.bookId} title={section}>
      <SectionTimerBar bookId={params.bookId} test={testNum} section={section} />

      {part ? (
        <FormattedText text={part.text} />
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          The {section} section wasn&apos;t found for this test. It may not have
          been present in the uploaded book.
        </p>
      )}

      <BackToTest bookId={params.bookId} />
    </Shell>
  );
}

// Shared page frame: heading + content column.
function Shell({
  testNum,
  title,
  children,
}: {
  testNum: number;
  bookId: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-black/50 dark:text-white/50">Test {testNum}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </header>
      {children}
    </main>
  );
}

// The start/stop timer. Start and Stop toggle counting; Reset returns to 00:00.
function SectionTimerBar({
  bookId,
  test,
  section,
}: {
  bookId: string;
  test: number;
  section: Section;
}) {
  const { running, elapsedMs, start, stop, reset } = useSectionTimer(
    bookId,
    test,
    section,
  );

  return (
    <section className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/10 bg-background/90 py-2 backdrop-blur dark:border-white/10">
      <span
        className="font-mono text-lg font-semibold tabular-nums tracking-tight"
        aria-live="off"
      >
        {formatDuration(elapsedMs)}
      </span>

      <div className="flex flex-1 justify-end gap-2">
        {running ? (
          <button
            onClick={stop}
            className="rounded-full bg-foreground px-4 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={start}
            className="rounded-full bg-foreground px-4 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90"
          >
            Start
          </button>
        )}
        <button
          onClick={reset}
          disabled={elapsedMs === 0 && !running}
          className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
        >
          Reset
        </button>
      </div>
    </section>
  );
}

function BackToTest({ bookId }: { bookId: string }) {
  const params = useParams<{ test: string }>();
  return (
    <Link
      href={`/tests/${bookId}/${params.test}`}
      className="w-fit text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
    >
      ← Back to test
    </Link>
  );
}
