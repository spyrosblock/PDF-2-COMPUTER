"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  extractPdf,
  splitIntoSkills,
  splitSkillIntoParts,
  splitOffAnswers,
  splitBookAnswers,
  attachWritingImages,
  formatSkill,
  formatText,
  type PageResult,
  type Part,
  type Progress,
  type TestSkill,
} from "@/lib/pdf";
import { analyzeBook, type AnalysisProgress } from "@/lib/analyze";
import { formatDuration } from "@/lib/timers";
import type { AnswerKey } from "@/lib/questions";
import { saveBook } from "@/lib/books";
import { useDebug } from "@/lib/debug";
import { FormattedText } from "@/app/FormattedText";
import { QuestionGroups } from "@/app/QuestionGroups";
import { ThemeToggle } from "@/app/ThemeToggle";

type Status = "idle" | "working" | "done" | "error";

// useDebug reads the URL query, so the page content must render under a
// <Suspense> boundary — otherwise the production build fails to prerender it.
export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageContent />
    </Suspense>
  );
}

function UploadPageContent() {
  const router = useRouter();
  const debug = useDebug();
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string>("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisProgress | null>(null);
  const [analysisTime, setAnalysisTime] = useState<number | null>(null);
  // When the AI-parsing wait began (epoch ms) and a clock tick that re-renders
  // the running timer a few times a second while it waits.
  const [analysisStart, setAnalysisStart] = useState(0);
  const [now, setNow] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [pages, setPages] = useState<PageResult[]>([]);
  const [skills, setSkills] = useState<TestSkill[]>([]);
  const [error, setError] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setStatus("working");
    setError("");
    setPages([]);
    setSkills([]);
    setProgress(null);
    setAnalysis(null);
    setAnalysisTime(null);
    setAnalysisStart(0);
    setNow(0);
    setFailed([]);
    setFileName(file.name);

    try {
      const results = await extractPdf(file, (p) => setProgress(p));
      setPages(results);

      // Split into skills, peel each answer key off first (so it's never swept
      // into the last part), then subdivide into parts — all on the raw
      // marker-carrying text, before formatSkill strips the markers. Books that
      // print one back-of-book key section instead of a key per skill have
      // nothing to peel, so fall back to that section's page for the skill.
      // Finally rasterise each Writing Task 1 page to an image.
      const bookAnswers = splitBookAnswers(results);
      const built = splitIntoSkills(results).map((raw) => {
        const { content, answers } = splitOffAnswers(raw);
        const key =
          answers ?? bookAnswers.get(`${raw.test}:${raw.skill}`) ?? null;
        return {
          ...formatSkill(content),
          parts: splitSkillIntoParts(content),
          answers: key ? formatText(key) : null,
        };
      });
      const withImages = await attachWritingImages(file, built);
      setSkills(withImages);

      // Read the questions out of every reading/listening part (passage,
      // questions, maps) and each skill's answer key — via the /api routes to
      // the Claude API. The slow step, hence its own progress line. Whatever
      // fails keeps its raw text.
      setAnalysisStart(Date.now());
      const analysed = await analyzeBook(file, withImages, setAnalysis);
      setSkills(analysed.skills);
      setFailed(analysed.failed);
      setAnalysisTime(analysed.elapsedMs);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to read the PDF.");
      setStatus("error");
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const reset = () => {
    setStatus("idle");
    setPages([]);
    setSkills([]);
    setProgress(null);
    setAnalysis(null);
    setAnalysisTime(null);
    setAnalysisStart(0);
    setNow(0);
    setFailed([]);
    setError("");
    setSaveError("");
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const busy = status === "working";

  // Tick while the AI parsing is in flight so the waiting timer advances.
  useEffect(() => {
    if (!busy || analysisStart === 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [busy, analysisStart]);

  const waitingMs = analysisStart > 0 && now > analysisStart ? now - analysisStart : 0;
  const ocrCount = pages.filter((p) => p.source === "ocr").length;
  const fullText = pages
    .map((p) => `----- Page ${p.page} (${p.source}) -----\n${p.text.trim()}`)
    .join("\n\n");
  // Persist to IndexedDB, then open; wait for the commit before navigating.
  const goToTests = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const id = await saveBook(fileName || "Untitled book", skills);
      router.push(`/tests/${id}`);
    } catch {
      setSaving(false);
      setSaveError("Couldn't save this book to your browser storage.");
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Upload IELTS practice PDF
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <Link
            href="/tests"
            className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Saved books
          </Link>
        </div>
      </header>

      <section
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (busy) return;
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-black/20 bg-black/2 p-10 text-center dark:border-white/20 dark:bg-white/3"
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={onInputChange}
          disabled={busy}
          className="hidden"
          id="pdf-input"
        />
        <label
          htmlFor="pdf-input"
          className={`cursor-pointer rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity ${
            busy ? "pointer-events-none opacity-50" : "hover:opacity-90"
          }`}
        >
          Choose PDF
        </label>
        <p className="text-xs text-black/50 dark:text-white/50">
          or drag &amp; drop a file here
        </p>
        {fileName && (
          <p className="mt-1 text-xs text-black/60 dark:text-white/60">
            {fileName}
          </p>
        )}
      </section>

      {busy && progress && !analysis && (
        <ProgressBar
          label={
            progress.phase === "ocr"
              ? `Running OCR on page ${progress.page}…`
              : `Extracting page ${progress.page}…`
          }
          done={progress.page}
          total={progress.totalPages}
        />
      )}

      {busy && analysis && (
        <ProgressBar
          label={
            analysis.done === 0
              ? "Reading passages, questions, maps and answers…"
              : `Read ${analysis.label}…`
          }
          done={analysis.done}
          total={analysis.total}
          elapsedMs={waitingMs}
        />
      )}

      {status === "error" && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {status === "done" && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-black/70 dark:text-white/70">
              Extracted <strong>{pages.length}</strong> page
              {pages.length === 1 ? "" : "s"}
              {ocrCount > 0 && <> ({ocrCount} via OCR)</>}.
              {analysisTime !== null && (
                <>
                  {" "}
                  AI parsing took {formatDuration(analysisTime)}.
                </>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={goToTests}
                disabled={skills.length === 0 || saving}
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save & go to test selection"}
              </button>
              {debug && (
                <button
                  onClick={() => navigator.clipboard.writeText(fullText)}
                  className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Copy all
                </button>
              )}
              <button
                onClick={reset}
                className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Upload another
              </button>
            </div>
          </div>

          {failed.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Couldn&apos;t read {failed.join(", ")} —{" "}
              {failed.length === 1 ? "it keeps" : "they keep"} the raw extracted
              text instead.
            </p>
          )}

          {skills.length === 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              No tests found in this PDF — the extracted text carries no
              &ldquo;Test N&rdquo; headings, so there was nothing to split and
              nothing to save.
            </p>
          )}

          {saveError && (
            <p className="text-sm text-red-700 dark:text-red-300">{saveError}</p>
          )}

          {debug && (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-black/10 bg-black/2 p-4 font-mono text-xs leading-relaxed dark:border-white/10 dark:bg-white/3">
              {fullText}
            </pre>
          )}

          {debug && (
          <div className="mt-4 flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Split into skills
            </h2>
            {skills.length === 0 ? (
              <p className="text-sm text-black/60 dark:text-white/60">
                Couldn&apos;t locate any &ldquo;Test N&rdquo; headings in the
                extracted text, so there was nothing to split.
              </p>
            ) : (
              skills.map((skill) => (
                <section
                  key={`${skill.test}-${skill.skill ?? "full"}`}
                  className="flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">
                      Test {skill.test} {skill.skill ?? "(full)"}{" "}
                      <span className="font-normal text-black/50 dark:text-white/50">
                        (pages {skill.startPage}&ndash;{skill.endPage})
                      </span>
                    </h3>
                    <button
                      onClick={() => navigator.clipboard.writeText(skill.text)}
                      className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                    >
                      Copy
                    </button>
                  </div>
                  {skill.parts.length > 0 ? (
                    <div className="flex flex-col gap-4 border-l border-black/10 pl-4 dark:border-white/10">
                      {skill.parts.map((part) => (
                        <section
                          key={part.index}
                          className="flex flex-col gap-2"
                        >
                          <h4 className="text-xs font-semibold text-black/70 dark:text-white/70">
                            {part.label}{" "}
                            <span className="font-normal text-black/50 dark:text-white/50">
                              (pages {part.startPage}&ndash;{part.endPage}
                              {part.expectedQuestions !== null && (
                                <>, {part.expectedQuestions} questions</>
                              )}
                              )
                            </span>
                          </h4>
                          <PartAnalysis part={part} />
                          {part.images?.map((src, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={src}
                              alt={`${part.label} page ${i + 1}`}
                              className="w-full rounded-lg border border-black/10 dark:border-white/10"
                            />
                          ))}
                        </section>
                      ))}
                    </div>
                  ) : (
                    <FormattedText text={skill.text} />
                  )}
                  {skill.answers && (
                    <details className="border-l border-black/10 pl-4 dark:border-white/10">
                      <summary className="cursor-pointer text-xs font-semibold text-black/70 dark:text-white/70">
                        Answers
                        {skill.answerKey && (
                          <span className="font-normal text-black/50 dark:text-white/50">
                            {" "}
                            ({skill.answerKey.length} read)
                          </span>
                        )}
                      </summary>
                      <div className="mt-2 flex flex-col gap-3">
                        {skill.answerKey && (
                          <AnswerKeyView answers={skill.answerKey} />
                        )}
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-black/50 dark:text-white/50">
                            Answer key as extracted
                          </summary>
                          <div className="mt-2">
                            <FormattedText text={skill.answers} />
                          </div>
                        </details>
                      </div>
                    </details>
                  )}
                </section>
              ))
            )}
          </div>
          )}
        </section>
      )}
    </main>
  );
}

// What the analysis made of one part, for the debug view, with the raw
// extracted text underneath for comparison. An untouched part shows raw text alone.
function PartAnalysis({ part }: { part: Part }) {
  const analysed = part.reading ?? part.listening;
  if (!analysed) return <FormattedText text={part.text} />;

  return (
    <>
      {part.reading && (
        <>
          <p className="text-xs font-semibold text-black/50 dark:text-white/50">
            Passage
          </p>
          <FormattedText text={part.reading.passage} />
        </>
      )}
      <p className="text-xs font-semibold text-black/50 dark:text-white/50">
        Questions
        {analysed.imagePages.length > 0 && (
          <span className="font-normal">
            {" "}
            (read from page image
            {analysed.imagePages.length === 1 ? "" : "s"}{" "}
            {analysed.imagePages.join(", ")})
          </span>
        )}
      </p>
      {analysed.groups?.length ? (
        <>
          <QuestionGroups groups={analysed.groups} />
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-black/50 dark:text-white/50">
              Questions as extracted
            </summary>
            <div className="mt-2">
              <FormattedText text={analysed.questions} />
            </div>
          </details>
        </>
      ) : (
        <FormattedText text={analysed.questions} />
      )}
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-black/50 dark:text-white/50">
          Raw extracted text
        </summary>
        <div className="mt-2">
          <FormattedText text={part.text} />
        </div>
      </details>
    </>
  );
}

// The answer key as read: one row per box, printed wording plus the accepted
// alternatives — for checking at a glance that the key is complete.
function AnswerKeyView({ answers }: { answers: AnswerKey }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4 gap-y-1 text-xs">
      {answers.map((answer) => (
        <li key={answer.n} className="flex gap-2">
          <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-black/50 dark:text-white/50">
            {answer.n}
          </span>
          <span className="flex flex-col">
            <span>
              {answer.printed}
              {answer.group && (
                <span className="text-black/50 dark:text-white/50">
                  {" "}
                  (either order: {answer.group.join(", ")})
                </span>
              )}
            </span>
            {answer.accept.length > 1 && (
              <span className="text-black/50 dark:text-white/50">
                {answer.accept.join(" / ")}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// One labelled progress bar, used for both passes over the book. An
// `elapsedMs` shows a running timer beside the count while the AI parses.
function ProgressBar({
  label,
  done,
  total,
  elapsedMs,
}: {
  label: string;
  done: number;
  total: number;
  elapsedMs?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-3 text-sm text-black/70 dark:text-white/70">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">
          {elapsedMs !== undefined && `${formatDuration(elapsedMs)} · `}
          {done} / {total}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-foreground transition-all"
          style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
