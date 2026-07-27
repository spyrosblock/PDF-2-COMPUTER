// Tesseract OCR fallback for pages with no usable text layer (e.g. scanned images).
// A single reusable worker is created lazily only when a page actually needs OCR
// (so PDFs with a clean text layer never pay for it).

import type { PDFDocumentProxy } from "pdfjs-dist";

type TesseractWorker = Awaited<
  ReturnType<typeof import("tesseract.js")["createWorker"]>
>;
let ocrWorker: TesseractWorker | null = null;

async function getOcrWorker(): Promise<TesseractWorker> {
  if (!ocrWorker) {
    const { createWorker } = await import("tesseract.js");
    ocrWorker = await createWorker("eng");
  }
  return ocrWorker;
}

export async function terminateOcr() {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
}

// Render a page to a canvas at 2× scale and run OCR over the image.
export async function ocrPage(
  doc: PDFDocumentProxy,
  pageNum: number,
): Promise<string> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context for OCR.");

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const worker = await getOcrWorker();
  const { data } = await worker.recognize(canvas);
  page.cleanup();
  return data.text ?? "";
}
