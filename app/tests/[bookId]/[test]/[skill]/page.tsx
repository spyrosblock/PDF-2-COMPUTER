"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Skill, TestSkill } from "@/lib/pdf";
import { useBook } from "@/lib/books";
import { slugToSkill } from "@/lib/skills";
import { useSkillTimer, formatDuration } from "@/lib/timers";
import { FormattedText } from "@/app/FormattedText";

// One skill of a test (Listening, Reading, or Writing) on its own page. It shows
// the skill's extracted text — broken into its parts (Listening Part 1-4, Reading
// Passage 1-3, Writing Task 1-2) when the split found them — and a start/stop
// timer that the student controls themselves; the timer is persisted per
// book/test/skill, so it survives navigation and reloads. The book is loaded from
// IndexedDB by the id in the URL, and the skill comes from the URL slug.
export default function SkillPage() {
  const params = useParams<{ bookId: string; test: string; skill: string }>();
  const testNum = Number(params.test);
  const skill = slugToSkill(params.skill);
  const { loading, book } = useBook(params.bookId);

  // The extracted skill for this test + skill, if the book has one.
  const testSkill = useMemo<TestSkill | undefined>(() => {
    if (!skill) return undefined;
    return (book?.skills ?? []).find(
      (s) => s.test === testNum && s.skill === skill,
    );
  }, [book, testNum, skill]);

  if (!skill) {
    return (
      <Shell testNum={testNum} bookId={params.bookId} title="Unknown skill">
        <p className="text-sm text-black/60 dark:text-white/60">
          &ldquo;{params.skill}&rdquo; isn&apos;t a skill of this test.
        </p>
        <BackToTest bookId={params.bookId} />
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell testNum={testNum} bookId={params.bookId} title={skill}>
        <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
      </Shell>
    );
  }

  return (
    <Shell testNum={testNum} bookId={params.bookId} title={skill}>
      <SkillTimerBar bookId={params.bookId} test={testNum} skill={skill} />

      {testSkill ? (
        <>
          {testSkill.parts.length > 0 ? (
            <div className="flex flex-col gap-8">
              {testSkill.parts.map((part) => (
                <section key={part.index} className="flex flex-col gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {part.label}
                    {part.expectedQuestions !== null && (
                      <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">
                        {part.expectedQuestions} questions
                      </span>
                    )}
                  </h2>
                  <FormattedText text={part.text} />
                </section>
              ))}
            </div>
          ) : (
            <FormattedText text={testSkill.text} />
          )}
          {testSkill.answers && (
            <details className="flex flex-col gap-2">
              <summary className="cursor-pointer text-lg font-semibold tracking-tight">
                Answers
              </summary>
              <div className="mt-2">
                <FormattedText text={testSkill.answers} />
              </div>
            </details>
          )}
        </>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          The {skill} skill wasn&apos;t found for this test. It may not have been
          present in the uploaded book.
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
function SkillTimerBar({
  bookId,
  test,
  skill,
}: {
  bookId: string;
  test: number;
  skill: Skill;
}) {
  const { running, elapsedMs, start, stop, reset } = useSkillTimer(
    bookId,
    test,
    skill,
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
