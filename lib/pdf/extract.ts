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

function textFromContent(
  items: Array<{ str?: string; hasEOL?: boolean }>,
): string {
  let out = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    out += item.str;
    out += item.hasEOL ? "\n" : "";
  }
  return out;
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
      const text = textFromContent(
        content.items as Array<{ str?: string; hasEOL?: boolean }>,
      );

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
