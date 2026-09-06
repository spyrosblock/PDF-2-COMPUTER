"use client";

// The paper marked: the score, then a line per box showing what the student
// wrote beside what the book prints. Marking itself is lib/questions/key.ts.
// Only numbered boxes the key covers are here — `total` is the key's length,
// never a hopeful 40.

import type { Marking } from "@/lib/questions";

export function Results({
  marking,
  onDismiss,
}: {
  marking: Marking;
  onDismiss: () => void;
}) {
  const wrong = marking.marks.filter((m) => !m.correct);
  const blank = marking.total - marking.answered;

  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-4 rounded-lg border border-black/15 bg-black/2 p-5 dark:border-white/20 dark:bg-white/3"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          <span className="tabular-nums">
            {marking.correct} / {marking.total}
          </span>{" "}
          correct
        </h2>
        {blank > 0 && (
          <span className="text-sm text-black/50 dark:text-white/50">
            {blank} left blank
          </span>
        )}
        <button
          onClick={onDismiss}
          className="ml-auto rounded-full border border-black/15 px-3 py-1 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Hide
        </button>
      </header>

      {wrong.length === 0 ? (
        <p className="text-sm text-black/70 dark:text-white/70">
          Every answer was right.
        </p>
      ) : (
        <>
          <p className="text-sm text-black/70 dark:text-white/70">
            {wrong.length === 1
              ? "One question to look at again:"
              : `${wrong.length} questions to look at again:`}
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {wrong.map((mark) => (
              <li key={mark.n} className="flex gap-3">
                <span className="min-w-6 shrink-0 pt-px text-right font-semibold tabular-nums text-black/60 dark:text-white/60">
                  {mark.n}
                </span>
                <span className="flex flex-1 flex-wrap items-baseline gap-x-2">
                  {mark.given ? (
                    <span className="text-red-700 line-through decoration-red-700/40 dark:text-red-400 dark:decoration-red-400/40">
                      {mark.given}
                    </span>
                  ) : (
                    <span className="text-black/40 italic dark:text-white/40">
                      left blank
                    </span>
                  )}
                  <span aria-hidden className="text-black/30 dark:text-white/30">
                    →
                  </span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {mark.printed}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
