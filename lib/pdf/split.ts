// Splitting a Cambridge IELTS book into its 4 tests, and each test into its parts.
//
// These books lay out four full practice tests back-to-back, each test's pages
// carrying a short running header / title like "Test 1", "Test 2 Reading", etc.
// We locate the first page where each test's heading appears and slice the page
// list at those boundaries. It's a heuristic on the raw text layer, not a
// semantic parse — good enough to preview the four tests separately.
//
// This module is pure text logic: it depends on nothing but the PageResult shape,
// so it can be exercised in isolation with plain fixtures.

import type { PageResult, Section, TestPart } from "./types";

const SECTIONS: Section[] = ["Listening", "Reading", "Writing", "Speaking"];

// Which test numbers appear as a *heading-like* line on a page — i.e. a short
// line that is essentially just "Test N" (running header or title), rather than
// an inline mention buried in a sentence. Returns the distinct numbers found.
function headingTestNumbers(pageText: string): Set<number> {
  const nums = new Set<number>();
  for (const raw of pageText.split(/\r?\n/)) {
    // "Test 1", "Test1", "TEST 2 Reading", "Test 3 Reading Passage" — the space
    // between "test" and the number is optional (some books render it glued), and
    // a short tail is allowed so headers with a section label still match, but
    // sentences don't.
    const m = /^\s*test\s*([1-4])\b.{0,24}$/i.exec(raw.trim());
    if (m) nums.add(Number(m[1]));
  }
  return nums;
}

// Which of the four sections start on a page — detected from a heading-like line
// that is essentially just the section name. A leading "Test N" is allowed (some
// books glue the section onto the running header, e.g. "Test 1 Reading") and a
// short tail is allowed so "Reading Passage 1" / "Writing Task 1" still match,
// but a sentence that merely opens with the word doesn't.
function sectionHeadings(pageText: string): Set<Section> {
  const found = new Set<Section>();
  for (const raw of pageText.split(/\r?\n/)) {
    const m = /^\s*(?:test\s*[1-4]\s*)?(listening|reading|writing|speaking)\b.{0,24}$/i.exec(
      raw.trim(),
    );
    if (m) {
      const word = m[1].toLowerCase();
      found.add((word[0].toUpperCase() + word.slice(1)) as Section);
    }
  }
  return found;
}

// The Cambridge books close with an "Audio scripts" section — transcripts of the
// listening tests. It's out of scope here (reading only) and, worse, it repeats
// "Test 1".."Test 4" headings, so if left in it gets swept into Test 4's slice
// (the last test runs to the end of the book). Find where it begins so we can
// drop it and everything after. Returns the page index, or -1 if not present.
//
// We scan from the *back*, because the front Contents page also lists
// "Audioscripts" (as an index entry), which a forward scan would wrongly take as
// the section start and so throw the whole book away. To tell the real section
// from that Contents reference — and from its own running headers, which repeat
// "Audioscripts" on later pages — we require a "Test 1"/"Test1" heading on the
// *same* page: the transcripts open with "Audioscripts" and "Test 1" together, so
// that pairing marks the section's start. A wider lookahead can't be used because
// "Test 1" recurs afterwards (answer keys, sample answers), which would pull the
// cut too far into the section. The first page with both, scanning backward, wins.
function isAudioHeading(text: string): boolean {
  // "Audioscript", "Audio scripts", "AUDIOSCRIPTS" as a heading-like line
  // (the space between the two words is optional; some books glue them).
  return text
    .split(/\r?\n/)
    .some((raw) => /^\s*audio\s*scripts?\b.{0,24}$/i.test(raw.trim()));
}

function audioScriptsIndex(pages: PageResult[]): number {
  for (let i = pages.length - 1; i >= 0; i--) {
    if (isAudioHeading(pages[i].text) && headingTestNumbers(pages[i].text).has(1))
      return i;
  }
  return -1;
}

// Render a contiguous run of pages into the labelled block format used throughout.
function slicePages(pages: PageResult[], from: number, to: number): string {
  return pages
    .slice(from, to)
    .map((p) => `----- Page ${p.page} (${p.source}) -----\n${p.text.trim()}`)
    .join("\n\n");
}

// Locate the four tests as page-index ranges into a trimmed page list — the
// coarse boundary heuristic that splitIntoParts then subdivides into sections.
function testBoundaries(
  allPages: PageResult[],
): { pages: PageResult[]; ranges: { from: number; to: number }[] } {
  if (allPages.length === 0) return { pages: [], ranges: [] };

  // Drop the trailing "Audio scripts" section (and anything after it) before
  // slicing, so it doesn't bleed into the last test.
  const cut = audioScriptsIndex(allPages);
  const pages = cut === -1 ? allPages : allPages.slice(0, cut);
  if (pages.length === 0) return { pages: [], ranges: [] };

  const headingSets = pages.map((p) => headingTestNumbers(p.text));

  // A page qualifies as test N's start only if its sole heading is N. Pages that
  // mention several tests at once (the contents page, the answer-key index) name
  // more than one number, so this filters them out as false boundaries.
  const qualifies = (idx: number, n: number) =>
    headingSets[idx].has(n) && headingSets[idx].size === 1;

  // Find each test's start page, scanning forward so boundaries stay in order.
  const startIdx: number[] = [];
  let cursor = 0;
  for (let n = 1; n <= 4; n++) {
    let found = -1;
    for (let i = cursor; i < pages.length; i++) {
      if (qualifies(i, n)) {
        found = i;
        break;
      }
    }
    if (found === -1) break;
    startIdx.push(found);
    cursor = found + 1;
  }

  const ranges = startIdx.map((from, i) => ({
    from,
    to: i + 1 < startIdx.length ? startIdx[i + 1] : pages.length,
  }));
  return { pages, ranges };
}

// Split each test further into its parts (Listening, Reading, Writing, Speaking)
// by finding, within the test's page range, the first page each section's heading
// appears on — scanning forward so the parts stay in printed order. Pages before
// the first detected section fold into that first part so nothing is dropped. If
// no sections are found for a test, it's emitted as one part with section: null.
export function splitIntoParts(allPages: PageResult[]): TestPart[] {
  const { pages, ranges } = testBoundaries(allPages);
  const parts: TestPart[] = [];

  ranges.forEach((range, i) => {
    const test = i + 1;

    // Where each detected section begins, in order.
    const marks: { section: Section; idx: number }[] = [];
    let cursor = range.from;
    for (const section of SECTIONS) {
      for (let p = cursor; p < range.to; p++) {
        if (sectionHeadings(pages[p].text).has(section)) {
          marks.push({ section, idx: p });
          cursor = p + 1;
          break;
        }
      }
    }

    if (marks.length === 0) {
      parts.push({
        test,
        section: null,
        startPage: pages[range.from].page,
        endPage: pages[range.to - 1].page,
        text: slicePages(pages, range.from, range.to),
      });
      return;
    }

    marks.forEach((mark, m) => {
      // Fold any preamble before the first section into that first part.
      const from = m === 0 ? range.from : mark.idx;
      const to = m + 1 < marks.length ? marks[m + 1].idx : range.to;
      parts.push({
        test,
        section: mark.section,
        startPage: pages[from].page,
        endPage: pages[to - 1].page,
        text: slicePages(pages, from, to),
      });
    });
  });

  return parts;
}
