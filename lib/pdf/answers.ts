// Splitting a skill's answer key off from its passages/questions.
//
// The Cambridge books print the correct answers for each Listening and Reading
// skill on their own page at the *end* of that skill — a page whose first line
// is essentially "Answer 1" / "Answer: 1", followed by the numbered answers.
// That page must not stay with the questions: showing it beside them would give
// the answers away, and (before parts are detected) it would otherwise be swept
// into the last part. So we slice it — and everything after it — off the skill's
// pages and keep it separately as the skill's answer key.
//
// Like split.ts, parts.ts and format.ts, this is pure string logic over the
// "----- Page N (source) -----" marker format slicePages emits, so it can be
// exercised in isolation with plain fixtures.

import type { TestSkill } from "./types";

// The page-boundary line slicePages writes: "----- Page 12 (text) -----".
const PAGE_MARKER = /^----- Page (\d+) \((text|ocr|empty)\) -----$/;

// The answer-key marker: the word "answer(s)" immediately followed by the number
// 1 ("Answer 1", "Answer: 1", "Answers 1" — the colon and spacing are optional).
// Deliberately NOT anchored to the line start: the Cambridge pages carry a
// running header/footer ("…Student's Book with Answers with Audio") that
// extract.ts folds onto the same visual line, so the real "Answer: 1" is usually
// preceded by that boilerplate rather than opening the line. The trailing "1"
// keeps it from matching the bare "Answers" in that boilerplate, and from
// matching a mid-key "2"/"3"… line, so only the page that *opens* the key hits.
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

// Whether a page opens the answer key. Tested against the page's lines *joined*,
// not line by line: extract.ts breaks the key's header table into separate runs,
// so "Answer:" and the "1" it precedes often land on different raw lines (and the
// running-header boilerplate can wedge between them). Joining first makes the
// marker contiguous. Column separators are collapsed for the same reason. A
// content page never matches: its only "answer" is the boilerplate "…with
// Answers with Audio", which is never followed by a "1".
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

// Split a skill into its passages/questions (`content`) and its answer key
// (`answers`, raw marker text — or null if the book carried none). The answer
// key is taken to start at the first page carrying an "Answer 1" marker, and to
// run to the end of the skill; the boilerplate printed before that marker on the
// opening page is trimmed away. `content` is the same skill with those pages
// removed and its endPage pulled back accordingly. If no answer page is found —
// or it is the skill's very first page, leaving no content — the whole skill is
// returned as content and answers is null.
export function splitOffAnswers(skill: TestSkill): {
  content: TestSkill;
  answers: string | null;
} {
  const pages = pseudoPages(skill.text);
  const at = pages.findIndex((p) => pageBeginsAnswers(p.lines));

  if (at <= 0) return { content: skill, answers: null };

  const contentPages = pages.slice(0, at);
  // Trim the pre-marker boilerplate off the page that opens the key; later answer
  // pages (numbers only, no marker) are left untouched.
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
