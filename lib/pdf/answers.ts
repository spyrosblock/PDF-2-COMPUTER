// Finding each skill's answer key. Books print one of two ways: at the end of
// each Listening/Reading skill (splitOffAnswers, which slices it — and
// everything after — off so it isn't swept into the last part), or as one
// back-of-book section covering all four tests (splitBookAnswers). Pure string
// logic over the marker format, like split.ts/parts.ts/format.ts.

import type { PageResult, Skill, TestSkill } from "./types";

// The page-boundary line slicePages writes: "----- Page 12 (text) -----".
const PAGE_MARKER = /^----- Page (\d+) \((text|ocr|empty)\) -----$/;

// The answer-key marker: "answer(s)" followed by "1". Not anchored to the line
// start, since a running-header boilerplate ("…with Answers with Audio") is
// folded onto the same line. The trailing "1" keeps it from matching that bare
// boilerplate or a mid-key "2"/"3"… line, so only the key's opening page hits.
const ANSWER_MARKER = /answers?\s*:?\s*1\b/i;

type PseudoPage = { page: number; source: string; lines: string[] };

// Rebuild the per-page list from a skill's raw marker text. Lines before the
// first marker (there shouldn't be any) are dropped.
function pseudoPages(raw: string): PseudoPage[] {
  const pages: PseudoPage[] = [];
  for (const line of raw.split("\n")) {
    const m = PAGE_MARKER.exec(line.trim());
    if (m) {
      pages.push({ page: Number(m[1]), source: m[2], lines: [] });
    } else if (pages.length > 0) {
      pages[pages.length - 1].lines.push(line);
    }
  }
  return pages;
}

// Whether a page opens the answer key. Tested against the page's lines *joined*
// (column separators collapsed): "Answer:" and its "1" often land on different
// raw lines. Content pages never match — their only "answer" is the boilerplate,
// never followed by a "1".
function pageBeginsAnswers(lines: string[]): boolean {
  const joined = lines.join(" ").replace(/\s*\|\s*/g, " ");
  return ANSWER_MARKER.test(joined);
}

// Strip the running header/footer boilerplate printed before "Answer: 1" on the
// page that opens the key, so the stored answers begin at the marker itself
// rather than at "…Student's Book with Answers with Audio Answer: 1 …".
function trimToMarker(lines: string[]): string[] {
  return lines.map((line) => {
    const collapsed = line.replace(/\s*\|\s*/g, " ");
    const m = ANSWER_MARKER.exec(collapsed);
    return m && m.index > 0 ? collapsed.slice(m.index) : line;
  });
}

// Re-emit a run of pseudo-pages in the marker format formatText expects.
function sliceText(pages: PseudoPage[]): string {
  return pages
    .map(
      (p) =>
        `----- Page ${p.page} (${p.source}) -----\n${p.lines.join("\n").trim()}`,
    )
    .join("\n\n");
}

// Split a skill into `content` and its answer key (`answers`, raw marker text —
// or null). The key starts at the first "Answer 1" page and runs to the end;
// the boilerplate before the marker is trimmed. If no answer page is found —
// or it is the skill's first page — the whole skill is content and answers
// is null.
export function splitOffAnswers(skill: TestSkill): {
  content: TestSkill;
  answers: string | null;
} {
  const pages = pseudoPages(skill.text);
  const at = pages.findIndex((p) => pageBeginsAnswers(p.lines));

  if (at <= 0) return { content: skill, answers: null };

  const contentPages = pages.slice(0, at);
  // Trim the pre-marker boilerplate off the key's opening page only.
  const answerPages = pages
    .slice(at)
    .map((p, i) => (i === 0 ? { ...p, lines: trimToMarker(p.lines) } : p));
  return {
    content: {
      ...skill,
      text: sliceText(contentPages),
      endPage: contentPages[contentPages.length - 1].page,
    },
    answers: sliceText(answerPages),
  };
}

// ---------------------------------------------------------------------------
// The other place a key is printed: one back-of-book section.
//
// Cambridge 19 (and 14) don't put a key at the end of each skill. They print a
// single "Listening and Reading answer keys" section after the audio scripts —
// a page per test and skill, each carrying that phrase as its running header.
// Those pages sit past the audio-scripts cut, so splitIntoSkills never sees
// them and splitOffAnswers above finds nothing inside any skill's own range.
// So we scan the whole book for the section separately and hand each page back
// to the skill it belongs to.

// The two skills a key covers — the printed section's own scope, and the only
// skills lib/analyze marks.
type KeySkill = Extract<Skill, "Listening" | "Reading">;

// The running header every page of the section carries. Matched as a whole
// line, with room for the page number printed beside it — the Introduction
// mentions the same phrase mid-sentence, and that page sits right against a
// test's opening page.
const KEY_SECTION_MARKER =
  /^(?:\d{1,3}\s+)?listening\s+and\s+reading\s+answer\s*keys?\b.{0,6}$/i;

// "TEST 1" as a heading-like line. A short tail is allowed so the Contents
// line ("Test 1   10") still matches — it names all four tests, which is how
// that page is recognised as *not* a key page.
const KEY_TEST_HEADING = /^test\s*([1-4])\b.{0,12}$/i;

// "LISTENING" / "READING" as a heading-like line. Strict on purpose: the
// running header above starts with "Listening" too, and must not read as a
// Listening heading on the Reading page.
const KEY_SKILL_HEADING =
  /^(?:test\s*[1-4]\s+)?(listening|reading)(?:\s+answers?(?:\s+key)?)?$/i;

// Collapse the column separators format.ts recognises, so a heading that was
// laid out in columns still reads as one line.
function collapse(line: string): string {
  return line.replace(/\s*\|\s*/g, " ").trim();
}

// Which test and skill a page of the section opens, from its headings. The
// test is null when the page names several (the Contents page), so such a page
// never starts a key.
function keyPageHeadings(lines: string[]): {
  test: number | null;
  skill: KeySkill | null;
} {
  const tests = new Set<number>();
  let skill: KeySkill | null = null;
  for (const raw of lines) {
    const line = collapse(raw);
    const t = KEY_TEST_HEADING.exec(line);
    if (t) tests.add(Number(t[1]));
    const s = KEY_SKILL_HEADING.exec(line);
    if (s && !skill) {
      const word = s[1].toLowerCase();
      skill = word === "listening" ? "Listening" : "Reading";
    }
  }
  return { test: tests.size === 1 ? [...tests][0] : null, skill };
}

// A page belongs to the key section if it carries the running header, or looks
// like one of its pages (a single test and a skill heading). Either is enough:
// OCR loses the header on the section's opening page (its display-size title),
// and a continuation page has the header but no headings of its own.
type MarkedPage = {
  page: PageResult;
  lines: string[];
  marker: boolean;
  test: number | null;
  skill: KeySkill | null;
};

function inSection(p: MarkedPage): boolean {
  return p.marker || (p.test !== null && p.skill !== null);
}

// The runs of belonging pages that carry the running header at least once —
// the key section, and nothing else. Requiring the header is what keeps a
// test's own Listening opening page (a single test and a skill heading, but no
// header anywhere near it) out.
function keySectionRuns(pages: PageResult[]): { at: number; run: MarkedPage[] }[] {
  const marked: MarkedPage[] = pages.map((page) => {
    const lines = page.text.split("\n");
    return {
      page,
      lines,
      marker: lines.some((line) => KEY_SECTION_MARKER.test(collapse(line))),
      ...keyPageHeadings(lines),
    };
  });

  const runs: { at: number; run: MarkedPage[] }[] = [];
  for (let i = 0; i < marked.length; i++) {
    if (!inSection(marked[i])) continue;
    let end = i;
    while (end + 1 < marked.length && inSection(marked[end + 1])) end++;
    const run = marked.slice(i, end + 1);
    if (run.some((p) => p.marker)) runs.push({ at: i, run });
    i = end;
  }
  return runs;
}

// Where the key section starts, as an index into `pages`, or -1 if the book
// has none. split.ts cuts the tests off there: a section printed *before* the
// audio scripts (ielts14 prints it in both places) would otherwise be swept
// into the last test's last skill.
export function bookAnswersIndex(pages: PageResult[]): number {
  const runs = keySectionRuns(pages).filter(({ run }) =>
    run.some((p) => p.test !== null && p.skill !== null),
  );
  return runs.length > 0 ? runs[0].at : -1;
}

// Find the back-of-book key section and split it per skill, keyed "1:Reading"
// (test number, then skill name). Inside a run, a page naming a test and a
// skill opens that skill's key and the pages after it continue it. Books that
// print per-skill keys instead (or none) yield an empty map.
export function splitBookAnswers(pages: PageResult[]): Map<string, string> {
  const buckets = new Map<string, PseudoPage[]>();

  for (const { run } of keySectionRuns(pages)) {
    const found = new Map<string, PseudoPage[]>();
    let current: string | null = null;
    for (const p of run) {
      if (p.test && p.skill) current = `${p.test}:${p.skill}`;
      if (!current) continue;
      const bucket = found.get(current) ?? [];
      bucket.push({ page: p.page.page, source: p.page.source, lines: p.lines });
      found.set(current, bucket);
    }

    // First printing wins. Some scans carry the whole section twice (ielts14
    // prints it before the audio scripts and again at the back); the second
    // copy is the same key, and appending it would hand the reader every
    // answer twice.
    for (const [key, pgs] of found) if (!buckets.has(key)) buckets.set(key, pgs);
  }

  return new Map([...buckets].map(([key, pgs]) => [key, sliceText(pgs)]));
}
