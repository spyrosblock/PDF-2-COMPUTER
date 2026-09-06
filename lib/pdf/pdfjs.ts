// Lazy pdf.js loader, kept separate so the library and its worker wiring are
// imported exactly once, on first use. Every PDF the app opens goes through
// loadPdf, so the runtime assets below are never forgotten at a call site.

import type { PDFDocumentLoadingTask } from "pdfjs-dist";

// pdf.js fetches these at runtime by URL rather than through the bundler:
// the WASM image decoders (JPEG 2000 and JBIG2 — scanned books are full of
// both), the 14 standard fonts, the predefined CMaps and the ICC profiles.
// They are copied into public/pdfjs by scripts/copy-pdfjs-assets.mjs; leaving
// any of them unset makes pdf.js skip what it can't decode, which for a
// JPEG 2000 scan means a blank page and, downstream, an empty OCR pass.
// Trailing slashes are required — pdf.js throws without them.
const ASSETS = {
  wasmUrl: "/pdfjs/wasm/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  iccUrl: "/pdfjs/iccs/",
};

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // Bundler-resolved worker URL (Turbopack/Webpack understand this pattern),
      // so the worker is served locally rather than from a CDN.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// Open a PDF's bytes with the asset URLs wired up. The caller owns the loading
// task: awaiting `.promise` gives the document, `.destroy()` frees the worker.
export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentLoadingTask> {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({ data, ...ASSETS });
}
