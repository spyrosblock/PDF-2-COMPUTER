// Typographic cleanup of raw sliced text. splitIntoSkills (split.ts) stores
// each skill as pages concatenated with "----- Page N (source) -----" markers,
// carrying hard line breaks, hyphenated words and stray page numbers. This
// turns that into readable prose with "--- start of page N ---" banners. Pure
// string logic over the marker format — no content interpretation (that's a
// later step) — so it can be exercised in isolation with plain fixtures.

import type { TestSkill } from "./types";

// The page-boundary line slicePages writes: "----- Page 12 (text) -----",
// with the page number captured for re-emitting as a banner.
const PAGE_MARKER = /^----- Page (\d+) \((?:text|ocr|empty)\) -----$/;

// Banner emitted in place of the raw marker, as its own paragraph.
function pageBanner(page: number): string {
  return `--- start of page ${page} ---`;
}

// The same banner, as a pattern — so formatted text can be taken apart page by
// page again (see splitByPage).
const PAGE_BANNER = /^--- start of page (\d+) ---$/;

// Lines that are just a page number — a common PDF footer/header artifact.
const PAGE_NUMBER_ONLY = /^\d{1,4}$/;

// Heading-, list- or table-like lines that keep their own break instead of
// being folded into the surrounding paragraph.
function isStructuralLine(line: string): boolean {
  return (
    / \| /.test(line) || // reconstructed table row
    /^questions?\b/i.test(line) ||
    /^[A-Z0-9][A-Z0-9 '":\-–—]{2,}$/.test(line) || // mostly-caps heading
    /^(?:[A-Za-z]|[ivxlIVXL]+|\d{1,3})[.)]\s+/.test(line) // "A." "iv)" "12."
  );
}

// Undo words split across a line break: "develop-\nment" -> "development".
// Next line must start lowercase, so real compounds are left alone.
function dehyphenate(text: string): string {
  return text.replace(/([A-Za-z])-\n([a-z])/g, "$1$2");
}

// One page's lines into paragraphs: blank lines and structural-line
// boundaries start a new paragraph; other lines are joined with a space.
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

// Clean raw sliced text into readable prose: paragraphs separated by "\n\n",
// each page preceded by a banner. Pages that clean up to nothing are dropped
// entirely, so no banner stands without content.
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

// Inverse of formatText's banners: split formatted prose back into its pages.
// Text before the first banner is dropped; only pages with content are listed.
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
