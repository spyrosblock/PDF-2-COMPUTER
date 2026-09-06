// pdf.js fetches part of itself at runtime by URL instead of through the
// bundler: the WASM image decoders (JPEG 2000, JBIG2), the 14 standard fonts,
// the predefined CMaps and the ICC profiles. Without them a scanned book whose
// pages are JPEG 2000 images renders blank — see lib/pdf/pdfjs.ts, which points
// pdf.js at the copies this script makes.
//
// Run before dev/build (see package.json) so the copies always match the
// installed pdfjs-dist; public/pdfjs is generated, not checked in.

import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = path.join(process.cwd(), "public", "pdfjs");

// The directories pdf.js asks for by URL, each matching one option in pdfjs.ts.
const DIRS = ["wasm", "standard_fonts", "cmaps", "iccs"];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const dir of DIRS) {
  await cp(path.join(pdfjsRoot, dir), path.join(target, dir), {
    recursive: true,
  });
}
console.log(`Copied pdf.js runtime assets to public/pdfjs (${DIRS.join(", ")}).`);
