// Typographic cleanup of a skill's (or part's) raw sliced text.
//
// splitIntoSkills (split.ts) stores each skill as a flat string: the PDF pages
// concatenated with "----- Page N (source) -----" markers, carrying pdf.js's
// hard line breaks (which follow the printed layout, not sentences), words
// hyphenated across line ends, and stray page numbers / running headers. That
// reads poorly in the UI.
//
// This module turns that raw text into readable prose: paragraphs separated by
// blank lines, with each printed page introduced by a "--- start of page N ---"
// banner so a reader can tell which page any passage/question came from. It is
// pure string logic that depends on nothing but the marker format slicePages
// emits — so, like split.ts, it can be exercised in isolation with plain
// fixtures. It does NOT interpret the content (passages vs. questions vs.
// answers); that semantic parse is a later step.

import type { TestSkill } from "./types";

// The page-boundary line slicePages writes: "----- Page 12 (text) -----".
// Splitting on it lets us treat each page separately (so a page number stuck on
// its own line can be dropped per page), and capture (group 1) the page number
// so we can re-emit it as a human-readable banner.
const PAGE_MARKER = /^----- Page (\d+) \((?:text|ocr|empty)\) -----$/;

// The page banner we emit into the cleaned prose in place of the raw marker, so
// the reader can tell which printed page each part of the text sits on. Kept as
// its own paragraph (blank line either side) so FormattedText renders it alone.
function pageBanner(page: number): string {
  return `--- start of page ${page} ---`;
}

// The same banner, as a pattern — so formatted text can be taken apart page by
// page again (see splitByPage).
const PAGE_BANNER = /^--- start of page (\d+) ---$/;

// Lines that are just a page number — a common PDF footer/header artifact.
const PAGE_NUMBER_ONLY = /^\d{1,4}$/;

// Heading- or list-like lines that should keep their own break rather than be
// folded into the surrounding paragraph: an all-caps run ("READING PASSAGE 1"),
// a "Questions 1-6" group header, a leading list marker ("A", "iv", "12."), or a
// reconstructed table row (extract.ts joins its cells with " | ") — folding a
// table row into a paragraph would destroy the row structure we recovered.
function isStructuralLine(line: string): boolean {
  return (
    / \| /.test(line) || // reconstructed table row
    /^questions?\b/i.test(line) ||
    /^[A-Z0-9][A-Z0-9 '":\-–—]{2,}$/.test(line) || // mostly-caps heading
    /^(?:[A-Za-z]|[ivxlIVXL]+|\d{1,3})[.)]\s+/.test(line) // "A." "iv)" "12."
  );
}

// Undo words split across a line break: "develop-\nment" -> "development".
// Only when the hyphen ends the line and the next line starts lowercase, so
// genuine hyphenated compounds at a line end are left alone conservatively.
function dehyphenate(text: string): string {
  return text.replace(/([A-Za-z])-\n([a-z])/g, "$1$2");
}

// Turn one page's lines into paragraphs. A blank line, or a boundary next to a
// structural line, starts a new paragraph; otherwise consecutive text lines are
// joined with a single space (they were only wrapped for layout).
function paragraphsFromPage(pageText: string): string {
  const lines = pageText
    .split("\n")
    .map((l) => l.replace(/\s+$/, "")) // trailing whitespace
    .filter((l) => !PAGE_NUMBER_ONLY.test(l.trim()));

  const paragraphs: string[] = [];
  let current = "";

  const flush = () => {
    const p = current.replace(/[ \t]{2,}/g, " ").trim();
    if (p) paragraphs.push(p);
    current = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      flush();
      continue;
    }
    if (isStructuralLine(trimmed)) {
      flush();
      paragraphs.push(trimmed);
      continue;
    }
    current = current ? `${current} ${trimmed}` : trimmed;
  }
  flush();

  return paragraphs.join("\n\n");
}

// Clean one raw sliced text into readable prose. Output contract: paragraphs
// separated by "\n\n", each page preceded by a "--- start of page N ---" banner
// — this is what the UI renders. Pages that clean up to nothing (blank/empty)
// are dropped, banner and all, so no banner ever stands without content.
export function formatText(raw: string): string {
  const dehyphenated = dehyphenate(raw);

  // Split into per-page chunks on the marker lines, keeping each page's number
  // so we can re-emit it as a banner in the marker's place.
  const pages: { page: number; text: string }[] = [];
  for (const line of dehyphenated.split("\n")) {
    const m = PAGE_MARKER.exec(line.trim());
    if (m) {
      pages.push({ page: Number(m[1]), text: "" });
    } else if (pages.length > 0) {
      const cur = pages[pages.length - 1];
      cur.text += (cur.text ? "\n" : "") + line;
    }
  }

  return pages
    .map((p) => ({ page: p.page, prose: paragraphsFromPage(p.text) }))
    .filter((p) => p.prose.length > 0)
    .map((p) => `${pageBanner(p.page)}\n\n${p.prose}`)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n") // collapse any run of blank lines
    .trim();
}

// The inverse of the banners formatText writes: take formatted prose apart into
// the printed pages it was assembled from, each with its page number. Lets a
// later step work a page at a time (the reading extraction sends pages to the
// API one by one) without keeping a second copy of the text around. Anything
// before the first banner is dropped, and a page whose prose is empty never had
// a banner to begin with, so the result only ever lists pages with content.
export function splitByPage(
  formatted: string,
): { page: number; text: string }[] {
  const pages: { page: number; text: string }[] = [];
  for (const line of formatted.split("\n")) {
    const m = PAGE_BANNER.exec(line.trim());
    if (m) {
      pages.push({ page: Number(m[1]), text: "" });
    } else if (pages.length > 0) {
      const cur = pages[pages.length - 1];
      cur.text += (cur.text ? "\n" : "") + line;
    }
  }
  return pages.map((p) => ({ ...p, text: p.text.trim() }));
}

// Convenience wrapper: return the skill with its whole-skill text cleaned up.
export function formatSkill(skill: TestSkill): TestSkill {
  return { ...skill, text: formatText(skill.text) };
}
