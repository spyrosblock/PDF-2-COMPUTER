// Rasterising selected PDF pages to images.
//
// Three callers need a printed page as a picture rather than as text:
//  - Writing Task 1 is a chart / graph / map / diagram the student must describe
//    — visual content the text layer can't carry — so we keep the whole page as
//    an image and show it beneath the extracted prompt (attachWritingImages).
//  - Question extraction falls back to page images whenever the API says the
//    questions text is too garbled to read (lib/analyze).
//  - A question set answered against a map, plan or diagram needs that picture
//    shown beside it, cropped out of its page (lib/analyze/figures.ts) — hence
//    the optional crop box.
//
// The splits (parts.ts) are pure text logic with no access to the PDF document,
// so all three are second passes over the file: openPdf re-opens it,
// renderPageImage draws the pages that are actually wanted, and the result is a
// JPEG data URL — small enough to sit in IndexedDB, or to post to our API routes.

import { getPdfjs } from "./pdfjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TestSkill } from "./types";

// 2× so the rendered page is crisp on high-DPI screens (and legible to the API
// when it reads a page itself); JPEG keeps the data URL small — a page as PNG is
// several MB, far too heavy for IndexedDB.
const RENDER_SCALE = 2;
const JPEG_QUALITY = 0.85;

// The label parts.ts gives Writing Task 1. Only that part gets an image.
const TASK_ONE_LABEL = "Task 1";

export type OpenPdf = {
  doc: PDFDocumentProxy;
  close: () => Promise<void>;
};

// Open a PDF for rendering. The caller must close() when done, or the worker and
// its buffer stay alive.
export async function openPdf(file: File): Promise<OpenPdf> {
  const pdfjs = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  return { doc, close: () => loadingTask.destroy() };
}

// A rectangle of a page, as fractions of its width and height measured from the
// top-left corner. What the API hands back when it locates a figure.
export type CropBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// Cut `box` out of a rendered page. Sizes are rounded outward and clamped to the
// canvas, so a box touching an edge keeps the edge rather than losing a pixel of
// it. A box that rounds away to nothing gives back the page whole.
function crop(canvas: HTMLCanvasElement, box: CropBox): HTMLCanvasElement {
  const left = Math.max(0, Math.floor(box.left * canvas.width));
  const top = Math.max(0, Math.floor(box.top * canvas.height));
  const width = Math.min(canvas.width - left, Math.ceil((box.right - box.left) * canvas.width));
  const height = Math.min(canvas.height - top, Math.ceil((box.bottom - box.top) * canvas.height));
  if (width <= 0 || height <= 0) return canvas;

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(canvas, left, top, width, height, 0, 0, width, height);
  return out;
}

// Render one page to a canvas and return it as a JPEG data URL — the whole page,
// or just `box` of it. The page is always drawn whole and then cut down, because
// the crop is a fraction of the rendered page rather than of the PDF's own
// coordinate space (which the API, looking at the rendered image, never sees).
export async function renderPageImage(
  doc: PDFDocumentProxy,
  pageNum: number,
  box?: CropBox,
): Promise<string> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context for rendering.");

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return (box ? crop(canvas, box) : canvas).toDataURL("image/jpeg", JPEG_QUALITY);
}

// Attach a full-page image to every Writing Task 1 part. Returns the skills with
// Task 1 parts carrying `images` (one data URL per page in the task's range);
// every other skill and part is returned unchanged. If no Task 1 part is present
// the PDF is never re-opened.
export async function attachWritingImages(
  file: File,
  skills: TestSkill[],
): Promise<TestSkill[]> {
  const hasTaskOne = skills.some(
    (s) =>
      s.skill === "Writing" && s.parts.some((p) => p.label === TASK_ONE_LABEL),
  );
  if (!hasTaskOne) return skills;

  const { doc, close } = await openPdf(file);

  try {
    return await Promise.all(
      skills.map(async (skill) => {
        if (skill.skill !== "Writing") return skill;
        const parts = await Promise.all(
          skill.parts.map(async (part) => {
            if (part.label !== TASK_ONE_LABEL) return part;
            const images: string[] = [];
            for (let p = part.startPage; p <= part.endPage; p++) {
              images.push(await renderPageImage(doc, p));
            }
            return { ...part, images };
          }),
        );
        return { ...skill, parts };
      }),
    );
  } finally {
    await close();
  }
}
