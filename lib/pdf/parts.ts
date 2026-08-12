// Subdividing one skill into its parts.
//
// splitIntoSkills (split.ts) gives each skill as a flat run of pages in the
// "----- Page N (source) -----" block format. IELTS skills are themselves made
// of parts — Listening Part 1-4, Reading Passage 1-3, Writing Task 1-2 — each
// introduced by a short heading line. We locate those headings and slice the
// skill's pages at them, mirroring the boundary heuristic split.ts uses for
// tests/skills. It's a text heuristic, not a semantic parse: it splits the text
// into parts, it does NOT read the individual questions (a later step).
//
// Like split.ts and format.ts, this is pure string logic over the marker format
// slicePages emits, so it can be exercised in isolation with plain fixtures.

import { formatText } from "./format";
import type { Part, Skill, TestSkill } from "./types";

// The page-boundary line slicePages writes: "----- Page 12 (text) -----".
const PAGE_MARKER = /^----- Page (\d+) \((text|ocr|empty)\) -----$/;

type PseudoPage = { page: number; source: string; text: string };

// How many parts each skill has, how to spot each part's heading, the questions
// each part carries (per IELTS Academic), and how to label it. Skills absent here
// (Speaking) aren't subdivided.
//
// Two detection modes:
//  - "numbered": the heading carries its part number (capture group 1); we look
//    for each expected number in turn. Robust against stray heading-like lines.
//  - "ordered": the part number may be absent, so we can't key off it — we take
//    every part heading in printed order and assign 1..count by position.
type PartSpec = {
  count: number;
  mode: "numbered" | "ordered";
  heading: RegExp;
  questions: (number | null)[];
  label: (n: number) => string;
  // Optional: end the LAST part's prose at this marker (inclusive), cutting at the
  // marker's last occurrence. Used for Writing Task 2, which closes the skill with
  // "Write at least 250 words." and has the next section's fragments / page
  // furniture swept in after it. Only the final part is trimmed (Task 1 is left
  // whole); the regex should be global so the last match can be found.
  endAt?: RegExp;
};

const PART_SPECS: Partial<Record<Skill, PartSpec>> = {
  // Listening: 4 parts of 10 questions, headed "PART 1-4" (newer/computer-delivered)
  // or "SECTION 1-4" (older books). Some books print the part number badly or drop
  // it entirely — the header shows as a bare "PART" or "PART Questions 1-10" — so we
  // detect by order rather than by number: the heading is part/section, with the
  // number optional and an optional inline "Questions ..." tail.
  Listening: {
    count: 4,
    mode: "ordered",
    heading: /^(?:part|section)\b\s*(?:[1-4]\b\s*)?(?:questions?\b)?.{0,24}$/i,
    questions: [10, 10, 10, 10],
    label: (n) => `Part ${n}`,
  },
  // Reading: 3 passages of 13 / 13 / 14 questions. Headed "READING PASSAGE 1-3",
  // sometimes just "Passage N" or "Section N" — the number is reliable here.
  Reading: {
    count: 3,
    mode: "numbered",
    heading: /^(?:reading\s+passage|passage|section)\s*([1-3])\b.{0,24}$/i,
    questions: [13, 13, 14],
    label: (n) => `Reading Passage ${n}`,
  },
  // Writing: 2 tasks, no fixed question count. Headed "WRITING TASK 1/2" or "Task N".
  // Each task's prompt ends with "Write at least 150/250 words." — we cut the part
  // there so nothing printed after it (the following section, page furniture) is
  // kept.
  Writing: {
    count: 2,
    mode: "numbered",
    heading: /^(?:writing\s+)?task\s*([12])\b.{0,24}$/i,
    questions: [null, null],
    label: (n) => `Task ${n}`,
    endAt: /write at least 250 words\./gi,
  },
};

// Rebuild the per-page list from a skill's raw marker text. Lines before the
// first marker (there shouldn't be any) are dropped; if the text carries no
// markers at all, this returns [] and the caller falls back to a single part.
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

// The part numbers whose heading appears on a page — a short heading-like line
// that is essentially just "Part 2" / "Reading Passage 3" / "Task 1", not an
// inline mention in a sentence (same anchoring as split.ts's heading scans).
function partNumbersOnPage(pageText: string, heading: RegExp): Set<number> {
  const nums = new Set<number>();
  for (const raw of pageText.split(/\r?\n/)) {
    const m = heading.exec(raw.trim());
    if (m) nums.add(Number(m[1]));
  }
  return nums;
}

// Whether any line on a page is a part heading (used by ordered mode, where the
// heading may not carry a number to key off).
function hasHeadingLine(pageText: string, heading: RegExp): boolean {
  return pageText.split(/\r?\n/).some((raw) => heading.test(raw.trim()));
}

// Drop every line above the first part heading on a page, keeping the heading
// line itself. Applied to the first page of every part's slice so anything
// printed above the "Part N" keyword — a cover/instructions block, or the tail
// of the previous part — is left out of that part.
function dropAboveHeading(pageText: string, heading: RegExp): string {
  const lines = pageText.split(/\r?\n/);
  const at = lines.findIndex((raw) => heading.test(raw.trim()));
  return at <= 0 ? pageText : lines.slice(at).join("\n");
}

type Mark = { index: number; idx: number };

// Numbered mode: find the first page (scanning forward) that heads each expected
// part number 1..count, in order. Mirrors the boundary scan in split.ts.
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

// Ordered mode: take each page that carries a part heading, in printed order, and
// number them 1, 2, 3… — for skills whose printed part number is unreliable or
// omitted (Listening). At most one mark per page, so slices are never empty.
function detectByOrder(pages: PseudoPage[], spec: PartSpec): Mark[] {
  const marks: Mark[] = [];
  for (let p = 0; p < pages.length; p++) {
    if (hasHeadingLine(pages[p].text, spec.heading)) {
      marks.push({ index: marks.length + 1, idx: p });
    }
  }
  return marks;
}

// Cut formatted prose off at (and including) the LAST match of `marker`, then
// trim. Used to end Writing Task 2 at its final "Write at least 250 words." line
// so the junk the extractor sweeps in afterwards is dropped. `marker` must be a
// global regex (we scan every match and keep the last). No match → text unchanged.
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

// A single unsplit part covering the whole skill — the honest fallback when the
// part headings can't be found or don't match the expected count, rather than
// guessing boundaries.
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

// Split one skill into its parts by locating each part's heading within the
// skill's pages (see PartSpec for the per-skill detection mode), so parts stay in
// printed order. Each part begins at its heading: anything printed above the
// "Part N" keyword is dropped (including the preamble before Part 1). If the
// count of detected headings doesn't match the skill's expected part count, we
// give up and return a single whole-skill part. Skills with no spec (Speaking,
// or a skill we couldn't identify) return [].
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
    // Start the part at its heading: drop anything printed above the "Part N"
    // keyword on the slice's first page (for Part 1 this also drops the preamble
    // pages before it, since the slice begins at the heading page).
    const first = raw[0];
    const slice = [
      { ...first, text: dropAboveHeading(first.text, spec.heading) },
      ...raw.slice(1),
    ];
    const text = formatText(sliceText(slice));
    // Trim only the final part (Writing Task 2) at its "Write at least 250 words."
    // line; earlier parts (Task 1) are left whole.
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
