// Typographic cleanup of a TestPart's raw sliced text.
//
// splitIntoParts (split.ts) stores each part as a flat string: the PDF pages
// concatenated with "----- Page N (source) -----" markers, carrying pdf.js's
// hard line breaks (which follow the printed layout, not sentences), words
// hyphenated across line ends, and stray page numbers / running headers. That
// reads poorly in the UI.
//
// This module turns that raw text into readable prose: paragraphs separated by
// blank lines, no page markers. It is pure string logic that depends on nothing
// but the marker format slicePages emits — so, like split.ts, it can be
// exercised in isolation with plain fixtures. It does NOT interpret the content
// (passages vs. questions vs. answers); that semantic parse is a later step.

import type { TestPart } from "./types";

// The page-boundary line slicePages writes: "----- Page 12 (text) -----".
// Splitting on it lets us drop the markers and treat each page separately (so a
// page number stuck on its own line can be dropped per page).
const PAGE_MARKER = /^----- Page \d+ \((?:text|ocr|empty)\) -----$/;

// Lines that are just a page number — a common PDF footer/header artifact.
const PAGE_NUMBER_ONLY = /^\d{1,4}$/;

// Heading- or list-like lines that should keep their own break rather than be
// folded into the surrounding paragraph: an all-caps run ("READING PASSAGE 1"),
// a "Questions 1-6" group header, or a leading list marker ("A", "iv", "12.").
function isStructuralLine(line: string): boolean {
  return (
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

// Clean one part's raw text into readable prose. Output contract: paragraphs
// separated by "\n\n", with no page markers — this is what the UI renders.
export function formatSectionText(raw: string): string {
  const dehyphenated = dehyphenate(raw);

  // Split into per-page chunks on the marker lines, dropping the markers.
  const pages = dehyphenated
    .split("\n")
    .reduce<string[]>(
      (acc, line) => {
        if (PAGE_MARKER.test(line.trim())) {
          acc.push(""); // start a new page chunk
        } else {
          acc[acc.length - 1] += (acc[acc.length - 1] ? "\n" : "") + line;
        }
        return acc;
      },
      [""],
    );

  return pages
    .map(paragraphsFromPage)
    .filter((p) => p.length > 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n") // collapse any run of blank lines
    .trim();
}

// Convenience wrapper: return the part with its text cleaned up.
export function formatPart(part: TestPart): TestPart {
  return { ...part, text: formatSectionText(part.text) };
}
