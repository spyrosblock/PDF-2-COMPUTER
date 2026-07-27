// Lazy pdf.js loader. Kept in its own module so the (large) library and its worker
// wiring are imported exactly once, on first use.

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export async function getPdfjs() {
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
