// Rasterising selected PDF pages to images.
//
// Writing Task 1 is a chart / graph / map / diagram the student must describe —
// visual content the text layer can't carry. So for Task 1 we keep the whole page
// as an image and show it beneath the extracted prompt on the Writing page. The
// split (parts.ts) is pure text logic and has no access to the PDF document, so
// this is a second, cheap pass: it re-opens the PDF and renders only the handful
// of Task 1 pages, then bakes the images (as data URLs) into those parts so they
// persist in IndexedDB alongside the rest of the book.

import { getPdfjs } from "./pdfjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TestSkill } from "./types";

// 2× so the rendered page is crisp on high-DPI screens; JPEG keeps the stored
// data URL small (a page as PNG is several MB — far too heavy for IndexedDB).
const RENDER_SCALE = 2;
const JPEG_QUALITY = 0.85;

// The label parts.ts gives Writing Task 1. Only that part gets an image.
const TASK_ONE_LABEL = "Task 1";

// Render one page to a canvas and return it as a JPEG data URL.
async function renderPage(
  doc: PDFDocumentProxy,
  pageNum: number,
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
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
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

  const pdfjs = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const doc = await loadingTask.promise;

  try {
    return await Promise.all(
      skills.map(async (skill) => {
        if (skill.skill !== "Writing") return skill;
        const parts = await Promise.all(
          skill.parts.map(async (part) => {
            if (part.label !== TASK_ONE_LABEL) return part;
            const images: string[] = [];
            for (let p = part.startPage; p <= part.endPage; p++) {
              images.push(await renderPage(doc, p));
            }
            return { ...part, images };
          }),
        );
        return { ...skill, parts };
      }),
    );
  } finally {
    await loadingTask.destroy();
  }
}
