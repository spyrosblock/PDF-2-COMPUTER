// Subdividing one skill into its parts (Listening Part 1-4, Reading Passage
// 1-3, Writing Task 1-2). Locates each part's heading and slices the skill's
// pages at it. A text heuristic, not a semantic parse — questions are read in
// a later step. Pure string logic over the marker format, like split.ts.

import { formatText } from "./format";
import type { Part, Skill, TestSkill } from "./types";

// The page-boundary line slicePages writes: "----- Page 12 (text) -----".
const PAGE_MARKER = /^----- Page (\d+) \((text|ocr|empty)\) -----$/;

type PseudoPage = { page: number; source: string; text: string };

// Per-skill spec: part count, heading pattern, question counts, labelling.
// Skills absent here (Speaking) aren't subdivided. Detection modes:
//  - "numbered": heading carries its part number; find each in turn.
//  - "ordered": number unreliable/absent; assign 1..count by printed position.
type PartSpec = {
  count: number;
  mode: "numbered" | "ordered";
  heading: RegExp;
  questions: (number | null)[];
  label: (n: number) => string;
  // End the LAST part's prose at this marker's last occurrence (regex must be
  // global). Used for Writing Task 2's trailing furniture.
  endAt?: RegExp;
};

const PART_SPECS: Partial<Record<Skill, PartSpec>> = {
  // Listening: 4 parts of 10 questions, headed "PART 1-4" or "SECTION 1-4".
  // The printed number is often bad or missing, so detect by order.
  Listening: {
    count: 4,
    mode: "ordered",
    heading: /^(?:part|section)\b\s*(?:[1-4]\b\s*)?(?:questions?\b)?.{0,24}$/i,
    questions: [10, 10, 10, 10],
    label: (n) => `Part ${n}`,
  },
  // Reading: 3 passages of 13 / 13 / 14 questions; the number is reliable.
  Reading: {
    count: 3,
    mode: "numbered",
    heading: /^(?:reading\s+passage|passage|section)\s*([1-3])\b.{0,24}$/i,
    questions: [13, 13, 14],
    label: (n) => `Reading Passage ${n}`,
  },
  // Writing: 2 tasks, no fixed question count. Each prompt ends with
  // "Write at least 250 words." — cut there to drop what follows.
  Writing: {
    count: 2,
    mode: "numbered",
    heading: /^(?:writing\s+)?task\s*([12])\b.{0,24}$/i,
    questions: [null, null],
    label: (n) => `Task ${n}`,
    endAt: /write at least 250 words\./gi,
  },
};

// Rebuild the per-page list from raw marker text; [] if no markers, in which
// case the caller falls back to a single part.
function pseudoPages(raw: string): PseudoPage[] {
  const pages: PseudoPage[] = [];
  for (const line of raw.split("\n")) {
    const m = PAGE_MARKER.exec(line.trim());
    if (m) {
      pages.push({ page: Number(m[1]), source: m[2], text: "" });
    } else if (pages.length > 0) {
      const cur = pages[pages.length - 1];
      cur.text += (cur.text ? "\n" : "") + line;
    }
  }
  return pages;
}

// Part numbers whose heading appears on a page (heading line, not an inline
// mention — same anchoring as split.ts's heading scans).
function partNumbersOnPage(pageText: string, heading: RegExp): Set<number> {
  const nums = new Set<number>();
  for (const raw of pageText.split(/\r?\n/)) {
    const m = heading.exec(raw.trim());
    if (m) nums.add(Number(m[1]));
  }
  return nums;
}

// Whether any line on a page is a part heading (used by ordered mode).
function hasHeadingLine(pageText: string, heading: RegExp): boolean {
  return pageText.split(/\r?\n/).some((raw) => heading.test(raw.trim()));
}

// Drop every line above the first part heading on a page, heading included.
function dropAboveHeading(pageText: string, heading: RegExp): string {
  const lines = pageText.split(/\r?\n/);
  const at = lines.findIndex((raw) => heading.test(raw.trim()));
  return at <= 0 ? pageText : lines.slice(at).join("\n");
}

type Mark = { index: number; idx: number };

// Numbered mode: find the first page heading each expected part number, in order.
function detectByNumber(pages: PseudoPage[], spec: PartSpec): Mark[] {
  const marks: Mark[] = [];
  let cursor = 0;
  for (let n = 1; n <= spec.count; n++) {
    let found = -1;
    for (let p = cursor; p < pages.length; p++) {
      if (partNumbersOnPage(pages[p].text, spec.heading).has(n)) {
        found = p;
        break;
      }
    }
    if (found === -1) break;
    marks.push({ index: n, idx: found });
    cursor = found + 1;
  }
  return marks;
}

// Ordered mode: number the heading-bearing pages 1, 2, 3… in printed order.
// At most one mark per page, so slices are never empty.
function detectByOrder(pages: PseudoPage[], spec: PartSpec): Mark[] {
  const marks: Mark[] = [];
  for (let p = 0; p < pages.length; p++) {
    if (hasHeadingLine(pages[p].text, spec.heading)) {
      marks.push({ index: marks.length + 1, idx: p });
    }
  }
  return marks;
}

// Cut the text at (and including) the LAST match of `marker` (must be global).
// No match → text unchanged.
function truncateAfter(text: string, marker: RegExp): string {
  const re = new RegExp(marker.source, marker.flags.includes("g") ? marker.flags : marker.flags + "g");
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) last = m;
  if (!last) return text;
  return text.slice(0, last.index + last[0].length).trimEnd();
}

// Re-emit a run of pseudo-pages in the marker format formatText expects, so each
// part is cleaned up exactly like the whole-skill text is.
function sliceText(pages: PseudoPage[]): string {
  return pages
    .map((p) => `----- Page ${p.page} (${p.source}) -----\n${p.text.trim()}`)
    .join("\n\n");
}

// Whole-skill fallback when headings can't be found or don't match the count.
function wholeSkillPart(skill: TestSkill): Part {
  return {
    index: 1,
    label: skill.skill ?? "Full",
    expectedQuestions: null,
    startPage: skill.startPage,
    endPage: skill.endPage,
    text: formatText(skill.text),
  };
}

// Split one skill into its parts, each starting at its heading. Falls back to
// a single whole-skill part if the detected heading count doesn't match the
// spec; skills with no spec (Speaking) return [].
export function splitSkillIntoParts(skill: TestSkill): Part[] {
  const spec = skill.skill ? PART_SPECS[skill.skill] : undefined;
  if (!spec) return [];

  const pages = pseudoPages(skill.text);

  const marks =
    spec.mode === "ordered"
      ? detectByOrder(pages, spec)
      : detectByNumber(pages, spec);

  if (marks.length !== spec.count) return [wholeSkillPart(skill)];

  return marks.map((mark, m) => {
    const to = m + 1 < marks.length ? marks[m + 1].idx : pages.length;
    const raw = pages.slice(mark.idx, to);
    // Start the part at its heading (for Part 1 this also drops the preamble).
    const first = raw[0];
    const slice = [
      { ...first, text: dropAboveHeading(first.text, spec.heading) },
      ...raw.slice(1),
    ];
    const text = formatText(sliceText(slice));
    // Trim only the final part (Writing Task 2) at its end marker.
    const isLast = mark.index === spec.count;
    return {
      index: mark.index,
      label: spec.label(mark.index),
      expectedQuestions: spec.questions[m] ?? null,
      startPage: slice[0].page,
      endPage: slice[slice.length - 1].page,
      text: spec.endAt && isLast ? truncateAfter(text, spec.endAt) : text,
    };
  });
}
