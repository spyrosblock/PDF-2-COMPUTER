// Client-side PDF text extraction.
//
// Strategy: pull the PDF's embedded text layer with pdf.js (instant + accurate).
// Only if a page has effectively no text layer (e.g. a scanned image page) do we
// fall back to running Tesseract OCR on a rendered image of that page. Everything
// runs in the browser — the PDF never leaves the user's machine.

import { getPdfjs } from "./pdfjs";
import { ocrPage, terminateOcr } from "./ocr";
import type { PageResult, Progress } from "./types";

// Below this many non-whitespace characters on a page, we assume the text layer
// is missing/insufficient and reach for OCR instead.
const MIN_TEXT_CHARS = 8;

// Reconstructing layout from text-item coordinates.
//
// pdf.js hands us the text layer as a flat list of runs, each with a position
// (transform), an advance width, and a font height — but no notion of "line",
// "paragraph", or "cell". Worse, in a table it serializes cell-by-cell, not
// row-by-row, and fills column gaps with wide whitespace runs — so simply
// concatenating `str` (or trusting `hasEOL`) collapses every table into a jumble.
//
// Instead we rebuild the visual layout from the geometry: group runs into lines by
// their baseline (y), order lines top-to-bottom and runs left-to-right, then look
// at the horizontal gap each run leaves to decide whether the next run is a normal
// word (space), a new column (COLUMN_SEPARATOR), or touching (nothing). Single-
// column prose comes out as one run per visual line with no separators — its
// reading order preserved — while tables keep their columns. It's a heuristic, not
// a real cell-box parse: independently-wrapped cells still surface as separate
// lines, but the column structure survives, which is what downstream needs.
//
// Thresholds are multiples of the line's font size so they scale with the type:
//  - COLUMN_FACTOR/COLUMN_FLOOR: a gap wider than max(FLOOR, FACTOR×fontSize) is a
//    column boundary. Set well above normal inter-word spacing so justified prose
//    is never mistaken for a table.
//  - SPACE_FACTOR: a smaller gap with no whitespace run of its own — insert a space.
//  - Y_FACTOR/Y_TOL_CAP: runs whose baselines differ by less than this share a line
//    (tolerates minor baseline drift; capped so adjacent text lines never merge).
// COLUMN_SEPARATOR must match the token format.ts recognizes to keep table rows on
// their own line.
const COLUMN_SEPARATOR = " | ";
const COLUMN_FACTOR = 1.2;
const COLUMN_FLOOR = 8;
const SPACE_FACTOR = 0.2;
const Y_FACTOR = 0.4;
const Y_TOL_CAP = 6;

type RawItem = {
  str?: string;
  transform?: unknown;
  width?: number;
  height?: number;
};

type Run = {
  str: string;
  x: number; // left edge, PDF user space
  y: number; // baseline, PDF user space (larger y = higher on the page)
  width: number; // advance width of str
  height: number; // ~ font size
};

// Keep only runs that carry visible text, with their coordinates. Whitespace-only
// runs are dropped: pdf.js emits them to pad column gaps, but we re-derive spacing
// from the coordinates ourselves, so keeping them would double-count the gap.
function toRuns(items: RawItem[]): Run[] {
  const runs: Run[] = [];
  for (const item of items) {
    if (typeof item.str !== "string" || item.str.trim() === "") continue;
    const t = Array.isArray(item.transform) ? item.transform : [];
    runs.push({
      str: item.str,
      x: typeof t[4] === "number" ? t[4] : 0,
      y: typeof t[5] === "number" ? t[5] : 0,
      width: typeof item.width === "number" ? item.width : 0,
      height: typeof item.height === "number" ? item.height : 0,
    });
  }
  return runs;
}

// Median font size across the page's runs — the reference for a line's y-tolerance
// and (as a fallback) a line whose runs all report zero height.
function medianHeight(runs: Run[]): number {
  const hs = runs
    .map((r) => r.height)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  return hs.length ? hs[Math.floor(hs.length / 2)] : 10;
}

// Assemble one visual line's runs (already left-to-right) into text, inserting a
// column separator, a single space, or nothing per the gap the previous run left.
function joinLine(line: Run[], fallbackHeight: number): string {
  const h = Math.max(0, ...line.map((r) => r.height)) || fallbackHeight;
  const colGap = Math.max(COLUMN_FLOOR, COLUMN_FACTOR * h);
  const spaceGap = SPACE_FACTOR * h;
  let out = line[0].str;
  for (let i = 1; i < line.length; i++) {
    const gap = line[i].x - (line[i - 1].x + line[i - 1].width);
    if (gap > colGap) out += COLUMN_SEPARATOR;
    else if (gap > spaceGap) out += " ";
    out += line[i].str;
  }
  return out;
}

function textFromContent(items: RawItem[]): string {
  const runs = toRuns(items);
  if (runs.length === 0) return "";

  const median = medianHeight(runs);
  const yTol = Math.min(Y_TOL_CAP, Y_FACTOR * median);

  // Group into visual lines by baseline, top of the page first. Baselines within a
  // line are effectively identical, and adjacent text lines sit well beyond yTol,
  // so comparing each run to the line's first run is enough.
  runs.sort((a, b) => b.y - a.y);
  const lines: Run[][] = [];
  for (const r of runs) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(r.y - last[0].y) <= yTol) last.push(r);
    else lines.push([r]);
  }

  return lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      return joinLine(line, median);
    })
    .join("\n");
}

export async function extractPdf(
  file: File,
  onProgress?: (p: Progress) => void,
): Promise<PageResult[]> {
  const pdfjs = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  const results: PageResult[] = [];

  try {
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.({ page: i, totalPages, phase: "text" });

      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      page.cleanup();
      const text = textFromContent(content.items as RawItem[]);

      if (text.replace(/\s/g, "").length >= MIN_TEXT_CHARS) {
        results.push({ page: i, text, source: "text" });
        continue;
      }

      // Text layer too thin — try OCR on the rendered page image.
      onProgress?.({ page: i, totalPages, phase: "ocr" });
      const ocrText = await ocrPage(doc, i);
      results.push({
        page: i,
        text: ocrText,
        source: ocrText.trim().length > 0 ? "ocr" : "empty",
      });
    }
  } finally {
    await loadingTask.destroy();
    await terminateOcr();
  }

  return results;
}
