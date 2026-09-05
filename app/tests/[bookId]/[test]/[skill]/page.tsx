"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Part, PartQuestions, Reading, TestSkill } from "@/lib/pdf";
import { useBook } from "@/lib/books";
import { slugToSkill } from "@/lib/skills";
import { useSkillTimer, formatDuration, type SkillTimer } from "@/lib/timers";
import { useAnswers, type AnswerSheet } from "@/lib/answers";
import { FormattedText } from "@/app/FormattedText";
import { QuestionGroups } from "@/app/QuestionGroups";
import { Results } from "@/app/Results";
import { markSheet, type Marking } from "@/lib/questions";

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

  // One sheet for the whole skill, so an answer typed into Part 1 is still there
  // after a look at Part 2 (the parts are tabs, and the hidden one unmounts).
  const answers = useAnswers(params.bookId, testNum, skill ?? "");

  // The extracted skill for this test + skill, if the book has one.
  const testSkill = useMemo<TestSkill | undefined>(() => {
    if (!skill) return undefined;
    return (book?.skills ?? []).find(
      (s) => s.test === testNum && s.skill === skill,
    );
  }, [book, testNum, skill]);

  // Marking is the skill's business rather than any one part's: the key covers
  // all forty boxes and the sheet holds all of them, so the button that hands
  // the paper in — and the report that comes back — sit out here, above the tabs
  // the parts are shown in. The timer is lifted here too, because handing a paper
  // in stops timing it.
  const timer = useSkillTimer(params.bookId, testNum, skill ?? "");
  const [marking, setMarking] = useState<Marking | null>(null);

  // Only Listening and Reading are marked: they are the skills the books print a
  // key for, and the only ones whose answers are boxes rather than an essay.
  const markable = skill === "Listening" || skill === "Reading";
  const answerKey = testSkill?.answerKey;
  const stopTimer = timer.stop;

  const submit = useCallback(() => {
    if (!answerKey?.length) return;
    stopTimer();
    setMarking(markSheet(answerKey, answers.all));
    // The report appears above the questions; the student is usually at the
    // bottom of the last part when they submit, so take them to it.
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
          <SkillTabs testSkill={testSkill} answers={answers} />
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
}: {
  testSkill: TestSkill;
  answers: AnswerSheet;
}) {
  const tabs = useMemo(() => {
    const list = testSkill.parts.map((part) => ({
      key: `part-${part.index}`,
      label: part.label,
      content: <PartContent part={part} answers={answers} />,
    }));
    if (testSkill.answers) {
      list.push({
        key: "answers",
        label: "Answers",
        content: <FormattedText text={testSkill.answers} />,
      });
    }
    return list;
  }, [testSkill, answers]);

  const [active, setActive] = useState(0);
  const current = tabs[Math.min(active, tabs.length - 1)];

  return (
    <>
      <section className="flex flex-col gap-2">{current.content}</section>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-background/90 backdrop-blur dark:border-white/10">
        <div className="mx-auto flex w-full max-w-4xl items-stretch gap-1 px-6 py-2">
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

// One part's heading (label + expected question count) followed by its content and
// any rendered page images (Writing Task 1). Four cases:
//  - a reading part that was split into passage and questions shows the two under
//    their own headings — the shape the test itself uses;
//  - a listening part is questions alone: nothing of the recording is printed, so
//    the questions (and the maps they are answered against) are the whole part;
//  - Writing Task 1 is a chart / graph / map whose real content is the page image,
//    and its extracted text is garbled OCR of that visual, so only the image shows;
//  - Writing Task 2 shows the task description the analysis read out of its text
//    (the raw text carries the heading, page banners and stray fragments around
//    it), falling back to that raw text when the read failed;
//  - anything else falls back to the part's raw extracted text.
// (The upload debug view still renders the raw text for every part.)
function PartContent({ part, answers }: { part: Part; answers: AnswerSheet }) {
  const hideText = part.label === "Task 1";
  // Names this part when a gap has no printed number of its own to be stored
  // under; the parts of a skill share one sheet, so "1" alone wouldn't do.
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
      {part.reading ? (
        <ReadingContent reading={part.reading} answers={answers} scope={scope} />
      ) : part.listening ? (
        // A listening part is questions and nothing else, so if none were read
        // there is nothing left to show — fall back to the raw extracted text
        // rather than to an empty tab.
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
        !hideText && (
          <FormattedText text={part.writing?.prompt || part.text} />
        )
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
    </>
  );
}

// A reading part as the exam presents it: the passage, then the questions. Not
// yet the side-by-side split of the real computer-delivered test — but already
// the two halves apart, which is what the extraction gives us. Either half can be
// empty if the API found nothing.
function ReadingContent({
  reading,
  answers,
  scope,
}: {
  reading: Reading;
  answers: AnswerSheet;
  scope: string;
}) {
  return (
    <>
      {reading.passage && <FormattedText text={reading.passage} />}
      <Questions questions={reading} heading answers={answers} scope={scope} />
      {!reading.passage && !reading.questions && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Nothing could be read out of this part.
        </p>
      )}
    </>
  );
}

// A part's questions, laid out as the book prints them when the analysis managed
// to structure them (see lib/questions) and answerable where it found gaps; when
// it didn't — and for books stored before that step existed — they fall back to
// the extracted text, which can only be read. A reading part heads them
// "Questions" to set them off from the passage above; a listening part is nothing
// but questions, so it doesn't.
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
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 pt-10 pb-28">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-black/50 dark:text-white/50">Test {testNum}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </header>
      {children}
    </main>
  );
}

// The bar the skill is sat under: the stopwatch on the left — Start and Stop
// toggle counting, Reset returns it to 00:00 — and, on the right, the button that
// hands the paper in. Submit is shown only for the skills that are marked at all
// (`onSubmit` is null otherwise) and is disabled when the book's key couldn't be
// read, since there would then be nothing to mark against; it stays enabled once
// a paper has been marked, so a student who corrects an answer can mark again.
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
