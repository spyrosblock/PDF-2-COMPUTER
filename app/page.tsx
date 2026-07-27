"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  extractPdf,
  splitIntoParts,
  formatPart,
  type PageResult,
  type Progress,
} from "@/lib/pdf";
import { saveBook } from "@/lib/books";
import { FormattedText } from "@/app/FormattedText";

type Status = "idle" | "working" | "done" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string>("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [pages, setPages] = useState<PageResult[]>([]);
  const [error, setError] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setStatus("working");
    setError("");
    setPages([]);
    setProgress(null);
    setFileName(file.name);

    try {
      const results = await extractPdf(file, (p) => setProgress(p));
      setPages(results);
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
    setProgress(null);
    setError("");
    setSaveError("");
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const busy = status === "working";
  const ocrCount = pages.filter((p) => p.source === "ocr").length;
  const fullText = pages
    .map((p) => `----- Page ${p.page} (${p.source}) -----\n${p.text.trim()}`)
    .join("\n\n");
  // Clean up each part at save time, so the readable prose is what's previewed
  // here and what saveBook persists to IndexedDB.
  const parts = useMemo(
    () => splitIntoParts(pages).map(formatPart),
    [pages],
  );

  // Persist this book to IndexedDB, then open it. We wait for the write to
  // commit before navigating so the test pages find it on arrival.
  const goToTests = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const id = await saveBook(fileName || "Untitled book", parts);
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
          <p className="text-sm text-black/60 dark:text-white/60">
            The PDF is read entirely in your browser — nothing is uploaded to a
            server. We extract the text layer directly, falling back to
            on-device OCR for any scanned page.
          </p>
        </div>
        <Link
          href="/tests"
          className="shrink-0 rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Saved books
        </Link>
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

      {busy && progress && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm text-black/70 dark:text-white/70">
            <span>
              {progress.phase === "ocr"
                ? `Running OCR on page ${progress.page}…`
                : `Extracting page ${progress.page}…`}
            </span>
            <span>
              {progress.page} / {progress.totalPages}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-foreground transition-all"
              style={{
                width: `${(progress.page / progress.totalPages) * 100}%`,
              }}
            />
          </div>
        </div>
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
            </p>
            <div className="flex gap-2">
              <button
                onClick={goToTests}
                disabled={parts.length === 0 || saving}
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save & go to test selection"}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(fullText)}
                className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Copy all
              </button>
              <button
                onClick={reset}
                className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Upload another
              </button>
            </div>
          </div>

          {saveError && (
            <p className="text-sm text-red-700 dark:text-red-300">{saveError}</p>
          )}

          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-black/10 bg-black/2 p-4 font-mono text-xs leading-relaxed dark:border-white/10 dark:bg-white/3">
            {fullText}
          </pre>

          <div className="mt-4 flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Split into test parts
            </h2>
            {parts.length === 0 ? (
              <p className="text-sm text-black/60 dark:text-white/60">
                Couldn&apos;t locate any &ldquo;Test N&rdquo; headings in the
                extracted text, so there was nothing to split.
              </p>
            ) : (
              parts.map((part) => (
                <section
                  key={`${part.test}-${part.section ?? "full"}`}
                  className="flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">
                      Test {part.test} {part.section ?? "(full)"}{" "}
                      <span className="font-normal text-black/50 dark:text-white/50">
                        (pages {part.startPage}&ndash;{part.endPage})
                      </span>
                    </h3>
                    <button
                      onClick={() => navigator.clipboard.writeText(part.text)}
                      className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                    >
                      Copy
                    </button>
                  </div>
                  <FormattedText text={part.text} />
                </section>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  );
}
