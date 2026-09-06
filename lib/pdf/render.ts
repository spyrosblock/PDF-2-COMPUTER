// Rasterising selected PDF pages to JPEG data URLs (small enough for IndexedDB
// or an API post). Callers: Writing Task 1's chart page (attachWritingImages),
// question extraction's page-image fallback (lib/analyze), and cropped figures
// (lib/analyze/figures.ts). These are second passes over the file, since the
// splits in parts.ts are pure text logic.

import { loadPdf } from "./pdfjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TestSkill } from "./types";

// 2× for high-DPI screens and API legibility; JPEG keeps the data URL small.
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
  const loadingTask = await loadPdf(await file.arrayBuffer());
  const doc = await loadingTask.promise;
  return { doc, close: () => loadingTask.destroy() };
}

// A page rectangle as width/height fractions from the top-left corner.
export type CropBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// Cut `box` out of a rendered page, clamped to the canvas. A degenerate box
// gives back the page whole.
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

// Render one page to a JPEG data URL — whole, or just `box` of it. The page is
// drawn whole and then cropped, since the box is a fraction of the rendered
// page, not of the PDF's coordinate space.
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

// Attach a full-page image to every Writing Task 1 part (one data URL per page
// in the task's range). Other skills/parts unchanged; the PDF is only opened
// when a Task 1 part exists.
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
