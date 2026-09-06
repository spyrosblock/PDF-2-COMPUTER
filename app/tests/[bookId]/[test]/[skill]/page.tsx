"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Part, PartQuestions, Reading, Skill, TestSkill } from "@/lib/pdf";
import { useBook } from "@/lib/books";
import { slugToSkill } from "@/lib/skills";
import { useSkillTimer, formatDuration, type SkillTimer } from "@/lib/timers";
import { useAnswers, type AnswerSheet } from "@/lib/answers";
import { FormattedText } from "@/app/FormattedText";
import { QuestionGroups } from "@/app/QuestionGroups";
import { Results } from "@/app/Results";
import { ThemeToggle } from "@/app/ThemeToggle";
import { markSheet, type Marking } from "@/lib/questions";

// One skill of a test on its own page: extracted text broken into parts, plus a
// persisted start/stop timer. Book from IndexedDB by URL id, skill from slug.
export default function SkillPage() {
  const params = useParams<{ bookId: string; test: string; skill: string }>();
  const testNum = Number(params.test);
  const skill = slugToSkill(params.skill);
  const { loading, book } = useBook(params.bookId);

  // One sheet for the whole skill: answers typed into Part 1 survive a look at
  // Part 2 (tabs unmount their hidden part).
  const answers = useAnswers(params.bookId, testNum, skill ?? "");

  // The extracted skill for this test + skill, if the book has one.
  const testSkill = useMemo<TestSkill | undefined>(() => {
    if (!skill) return undefined;
    return (book?.skills ?? []).find(
      (s) => s.test === testNum && s.skill === skill,
    );
  }, [book, testNum, skill]);

  // Marking and the timer live at the skill level, above the part tabs —
  // handing a paper in stops timing it.
  const timer = useSkillTimer(params.bookId, testNum, skill ?? "");
  const [marking, setMarking] = useState<Marking | null>(null);

  // Only Listening and Reading are marked — the skills with a printed key.
  const markable = skill === "Listening" || skill === "Reading";
  const answerKey = testSkill?.answerKey;
  const stopTimer = timer.stop;

  const submit = useCallback(() => {
    if (!answerKey?.length) return;
    stopTimer();
    setMarking(markSheet(answerKey, answers.all));
    // The report appears above the questions; scroll the student to it.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [answerKey, answers.all, stopTimer]);

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
      <SkillTimerBar
        timer={timer}
        onSubmit={markable && testSkill ? submit : null}
        canSubmit={!!answerKey?.length}
      />

      {marking && (
        <Results marking={marking} onDismiss={() => setMarking(null)} />
      )}

      {markable && testSkill && !answerKey?.length && (
        <p className="text-sm text-black/50 dark:text-white/50">
          No answer key was read out of the book for this skill, so it can&apos;t
          be marked.
        </p>
      )}

      {testSkill ? (
        testSkill.parts.length > 0 ? (
          <SkillTabs testSkill={testSkill} answers={answers} skill={skill} />
        ) : (
          <>
            <FormattedText text={testSkill.text} />
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
        )
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

// The skill's parts (Listening Part 1-4, Reading Passage 1-3, Writing Task 1-2)
// shown one at a time, switched via a bar fixed to the bottom of the page. When
// the book has an answer key it becomes an extra "Answers" tab at the end.
function SkillTabs({
  testSkill,
  answers,
  skill,
}: {
  testSkill: TestSkill;
  answers: AnswerSheet;
  skill: Skill;
}) {
  const tabs = useMemo(() => {
    const list = testSkill.parts.map((part) => ({
      key: `part-${part.index}`,
      label: part.label,
      content: <PartContent part={part} answers={answers} skill={skill} />,
    }));
    if (testSkill.answers) {
      list.push({
        key: "answers",
        label: "Answers",
        content: <FormattedText text={testSkill.answers} />,
      });
    }
    return list;
  }, [testSkill, answers, skill]);

  const [active, setActive] = useState(0);
  const current = tabs[Math.min(active, tabs.length - 1)];

  return (
    <>
      <section className="flex flex-col gap-2">{current.content}</section>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-background/90 backdrop-blur dark:border-white/10">
        <div className="flex w-full items-stretch gap-1 px-3 py-2 md:px-4">
          {tabs.map((tab, i) => (
            <button
              key={tab.key}
              onClick={() => setActive(i)}
              aria-current={i === active ? "page" : undefined}
              className={
                "flex-1 rounded-full px-3 py-2 text-xs font-medium transition-colors " +
                (i === active
                  ? "bg-foreground text-background"
                  : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

// One part's heading, content, and page images (Writing Task 1): reading shows
// passage/questions side by side, listening is questions alone, Writing Task 1
// shows only the chart image, Task 2 the read description (raw text as
// fallback), and anything else its raw extracted text.
function PartContent({
  part,
  answers,
  skill,
}: {
  part: Part;
  answers: AnswerSheet;
  skill: Skill;
}) {
  const hideText = part.label === "Task 1";
  // Names unnumbered gaps; the parts of a skill share one sheet.
  const scope = `p${part.index}`;
  return (
    <>
      <h2 className="text-lg font-semibold tracking-tight">
        {part.label}
        {part.expectedQuestions !== null && (
          <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">
            {part.expectedQuestions} questions
          </span>
        )}
      </h2>
      {skill === "Writing" ? (
        // A writing task is the exam's own split screen: the task on the left,
        // the essay typed on the right — like the computer-delivered test.
        <WritingPart part={part} answers={answers} scope={scope} />
      ) : part.reading ? (
        <ReadingContent reading={part.reading} answers={answers} scope={scope} />
      ) : part.listening ? (
        // A listening part is questions and nothing else — fall back to raw
        // text rather than an empty tab.
        part.listening.groups?.length || part.listening.questions ? (
          <Questions
            questions={part.listening}
            heading={false}
            answers={answers}
            scope={scope}
          />
        ) : (
          <FormattedText text={part.text} />
        )
      ) : (
        !hideText && <FormattedText text={part.text} />
      )}
      {skill !== "Writing" &&
        part.images?.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt={`${part.label} page ${i + 1}`}
            className="w-full rounded-lg border border-black/10 dark:border-white/10"
          />
        ))}
    </>
  );
}

// A writing task split-screen: task (chart image or read description) on the
// left, essay textarea on the right. The essay lives on the shared answer
// sheet, keyed per part; word count against the task's minimum underneath.
function WritingPart({
  part,
  answers,
  scope,
}: {
  part: Part;
  answers: AnswerSheet;
  scope: string;
}) {
  const id = `${scope}:essay`;
  const value = answers.get(id);
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const minWords = part.index === 1 ? 150 : 250;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        {part.label !== "Task 1" && (
          <FormattedText text={part.writing?.prompt || part.text} />
        )}
        {part.images?.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt={`${part.label} page ${i + 1}`}
            className="w-full rounded-lg border border-black/10 dark:border-white/10"
          />
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <textarea
          value={value}
          onChange={(e) => answers.set(id, e.target.value)}
          placeholder="Write your answer here…"
          spellCheck={false}
          className="min-h-[28rem] w-full flex-1 resize-y rounded-lg border border-black/10 bg-transparent p-4 text-sm leading-relaxed outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
        />
        <p className="text-xs text-black/50 dark:text-white/50">
          {words} words · aim for at least {minWords}
        </p>
      </div>
    </div>
  );
}

// A reading part split-screen: passage left, questions right. Both empty →
// the part says so instead of showing two blanks.
function ReadingContent({
  reading,
  answers,
  scope,
}: {
  reading: Reading;
  answers: AnswerSheet;
  scope: string;
}) {
  const hasQuestions = !!reading.groups?.length || !!reading.questions;
  return (
    // Wide screens: each half scrolls on its own; narrow screens stack.
    <div className="grid gap-6 md:h-[calc(100dvh-14rem)] md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2 md:border-r md:border-black/10 md:pr-3 md:overflow-y-auto dark:md:border-white/10">
        {reading.passage ? (
          <FormattedText text={reading.passage} />
        ) : (
          !hasQuestions && (
            <p className="text-sm text-black/60 dark:text-white/60">
              Nothing could be read out of this part.
            </p>
          )
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2 md:pl-3 md:overflow-y-auto">
        <Questions questions={reading} heading answers={answers} scope={scope} />
      </div>
    </div>
  );
}

// A part's questions as structured groups when the analysis managed it, falling
// back to the extracted text otherwise. A reading part heads them "Questions";
// a listening part is nothing but questions, so it doesn't.
function Questions({
  questions,
  heading,
  answers,
  scope,
}: {
  questions: PartQuestions;
  heading: boolean;
  answers: AnswerSheet;
  scope: string;
}) {
  if (!questions.groups?.length && !questions.questions) return null;
  return (
    <>
      {heading && (
        <h3 className="mt-4 text-base font-semibold tracking-tight">
          Questions
        </h3>
      )}
      {questions.groups?.length ? (
        <QuestionGroups
          groups={questions.groups}
          answers={answers}
          scope={scope}
        />
      ) : (
        <FormattedText text={questions.questions} />
      )}
    </>
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
    <main className="flex w-full flex-1 flex-col gap-6 px-3 pt-10 pb-28 md:px-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-black/50 dark:text-white/50">
            Test {testNum}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <ThemeToggle />
      </header>
      {children}
    </main>
  );
}

// The bar the skill sits under: stopwatch on the left, Submit on the right —
// shown only for marked skills (`onSubmit` null otherwise) and disabled when
// no key was read; it stays enabled once marked, so corrections can be re-marked.
function SkillTimerBar({
  timer,
  onSubmit,
  canSubmit,
}: {
  timer: SkillTimer;
  onSubmit: (() => void) | null;
  canSubmit: boolean;
}) {
  const { running, elapsedMs, start, stop, reset } = timer;

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
        {onSubmit && (
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            title={
              canSubmit
                ? undefined
                : "No answer key was read for this skill, so it can't be marked."
            }
            className="rounded-full bg-blue-600 px-4 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit
          </button>
        )}
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
