// Splitting a Cambridge IELTS book into its 4 tests, and each test into its
// skills. The tests run back-to-back, each carrying a "Test N" running header;
// we slice at the first page where each heading appears. A heuristic on the raw
// text layer, not a semantic parse. Pure text logic over the PageResult shape,
// so it can be exercised in isolation with plain fixtures.

import type { PageResult, Skill, TestSkill } from "./types";

const SKILLS: Skill[] = ["Listening", "Reading", "Writing", "Speaking"];

// Test numbers appearing as a heading-like line ("Test N"), not an inline
// mention. Returns the distinct numbers found.
function headingTestNumbers(pageText: string): Set<number> {
  const nums = new Set<number>();
  for (const raw of pageText.split(/\r?\n/)) {
    // Space between "test" and number optional; a short tail is allowed so
    // headers with a skill label still match, but sentences don't.
    const m = /^\s*test\s*([1-4])\b.{0,24}$/i.exec(raw.trim());
    if (m) nums.add(Number(m[1]));
  }
  return nums;
}

// Which skills start on a page, from a heading-like line. A leading "Test N"
// and a short tail are allowed ("Test 1 Reading", "Reading Passage 1"); a
// sentence that merely opens with the word doesn't match.
function skillHeadings(pageText: string): Set<Skill> {
  const found = new Set<Skill>();
  for (const raw of pageText.split(/\r?\n/)) {
    const m = /^\s*(?:test\s*[1-4]\s*)?(listening|reading|writing|speaking)\b.{0,24}$/i.exec(
      raw.trim(),
    );
    if (m) {
      const word = m[1].toLowerCase();
      found.add((word[0].toUpperCase() + word.slice(1)) as Skill);
    }
  }
  return found;
}

// Find where the trailing "Audio scripts" section begins, so it (which repeats
// "Test N" headings) can be dropped. Scans from the back: the front Contents
// page also lists "Audioscripts". The real section is identified by pairing
// "Audioscripts" with a "Test 1" heading on the same page — its running headers
// alone repeat "Audioscripts", and "Test 1" recurs later in the section. Returns
// the page index, or -1 if not present.
function isAudioHeading(text: string): boolean {
  // "Audio scripts" as a heading-like line (space optional).
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

// Locate the four tests as page-index ranges into a trimmed page list.
function testBoundaries(
  allPages: PageResult[],
): { pages: PageResult[]; ranges: { from: number; to: number }[] } {
  if (allPages.length === 0) return { pages: [], ranges: [] };

  // Drop the trailing "Audio scripts" section so it doesn't bleed into Test 4.
  const cut = audioScriptsIndex(allPages);
  const pages = cut === -1 ? allPages : allPages.slice(0, cut);
  if (pages.length === 0) return { pages: [], ranges: [] };

  const headingSets = pages.map((p) => headingTestNumbers(p.text));

  // A page qualifies as test N's start only if N is its sole heading — pages
  // mentioning several tests (contents, key index) are false boundaries.
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

// Split each test into its skills by finding the first page each skill's
// heading appears on, in printed order. Preamble before the first skill folds
// into it; a test with no detected skills is one TestSkill with skill: null.
// `parts` is left empty here; parts.ts subdivides downstream.
export function splitIntoSkills(allPages: PageResult[]): TestSkill[] {
  const { pages, ranges } = testBoundaries(allPages);
  const skills: TestSkill[] = [];

  ranges.forEach((range, i) => {
    const test = i + 1;

    // Where each detected skill begins, in order.
    const marks: { skill: Skill; idx: number }[] = [];
    let cursor = range.from;
    for (const skill of SKILLS) {
      for (let p = cursor; p < range.to; p++) {
        if (skillHeadings(pages[p].text).has(skill)) {
          marks.push({ skill, idx: p });
          cursor = p + 1;
          break;
        }
      }
    }

    if (marks.length === 0) {
      skills.push({
        test,
        skill: null,
        startPage: pages[range.from].page,
        endPage: pages[range.to - 1].page,
        text: slicePages(pages, range.from, range.to),
        parts: [],
        answers: null,
      });
      return;
    }

    marks.forEach((mark, m) => {
      // Fold any preamble before the first skill into that first skill.
      const from = m === 0 ? range.from : mark.idx;
      const to = m + 1 < marks.length ? marks[m + 1].idx : range.to;
      skills.push({
        test,
        skill: mark.skill,
        startPage: pages[from].page,
        endPage: pages[to - 1].page,
        text: slicePages(pages, from, to),
        parts: [],
        answers: null,
      });
    });
  });

  return skills;
}
