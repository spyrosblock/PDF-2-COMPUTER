// The shape one set of IELTS questions is stored in: the printed structure
// named, so a set can be laid out the way the book does. The words are never
// ours — every string is copied from the book (lib/claude/questions.ts); only
// the structure around them is inferred.

// The 11 official IELTS Academic Reading question types (SPECS.md), plus a
// fallback for a set that fits none of them. Summary, note, table and flow-chart
// completion are one type — they differ in how the gapped text is laid out, which
// `body` already carries, not in what the student does.
export const QUESTION_TYPES = [
  "multiple-choice",
  "true-false-not-given",
  "yes-no-not-given",
  "matching-information",
  "matching-headings",
  "matching-features",
  "matching-sentence-endings",
  "sentence-completion",
  "summary-completion",
  "diagram-labelling",
  "short-answer",
  "other",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

// Human labels, for the badge a group carries in the UI.
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  "multiple-choice": "Multiple choice",
  "true-false-not-given": "True / False / Not Given",
  "yes-no-not-given": "Yes / No / Not Given",
  "matching-information": "Matching information",
  "matching-headings": "Matching headings",
  "matching-features": "Matching features",
  "matching-sentence-endings": "Matching sentence endings",
  "sentence-completion": "Sentence completion",
  "summary-completion": "Summary / note / table completion",
  "diagram-labelling": "Diagram labelling",
  "short-answer": "Short answer",
  other: "Questions",
};

// One choosable answer: the letter or numeral the book prints against it, and
// the text beside it. `key` is "A", "iv", "TRUE" — whatever is printed.
export type Option = { key: string; text: string };

// The list a whole group draws its answers from: the box of headings, the list of
// researchers, the set of sentence endings. Absent when each question carries its
// own options instead (ordinary multiple choice).
export type OptionList = {
  title: string | null; // "List of Headings", "List of People"
  options: Option[];
};

export type TableRow = {
  header: boolean; // a column-heading row, printed bold
  cells: string[];
};

// The gapped text a completion question set is built on — a summary paragraph,
// a block of notes, a table, the boxes of a flow-chart. The gaps themselves are
// inline in the text as GAP tokens.
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "table"; rows: TableRow[] };

// One numbered question. `text` is the statement, sentence beginning, or question
// itself; a completion question keeps its gap inline as a GAP token.
export type Item = {
  n: number | null; // the printed question number; null for an unnumbered line
  text: string;
  select: number; // answers to choose — 2 for "Choose TWO letters", else 1
  options: Option[]; // this question's own options; empty when the group shares one list
};

// The picture a set is answered against — the map of a park, the plan of a
// building, a labelled diagram. It is never text on the page, so it can't be
// extracted like the rest of the set; it is rendered from the PDF and carried
// here as an image (see lib/analyze/figures.ts).
export type Figure = {
  image: string; // "data:image/jpeg;base64,..." rendered from the printed page
  alt: string; // a sentence describing it, for a student who can't see it
  page: number; // the printed page it was taken from
  cropped: boolean; // false when the whole page stands in for the picture
};

// One set of questions under a single "Questions X-Y" heading.
export type QuestionGroup = {
  type: QuestionType;
  heading: string; // "Questions 14-20", as printed
  instructions: string[]; // the instruction lines under it, one per line, verbatim
  optionList: OptionList | null;
  body: Block[]; // the summary/notes/table a completion set gaps; [] otherwise
  items: Item[]; // the numbered questions; [] when the gaps in `body` are the questions
  figure?: Figure; // the map/plan/diagram it is answered against, when it has one
};

// Whether a set can't be answered without seeing a picture — read off the
// printed instruction ("map", "plan", "diagram") or the diagram-labelling type.
const PICTURE_WORD = /\b(map|plan|diagram)\b/i;

export function needsFigure(group: QuestionGroup): boolean {
  return (
    group.type === "diagram-labelling" ||
    group.instructions.some((line) => PICTURE_WORD.test(line))
  );
}

// How a gap is written inside a string: "[[14]]" (or "[[]]" unnumbered). The
// renderer turns these into blanks; printed dots never survive as dots.
export const GAP = /\[\[(\d*)\]\]/g;

// The numbers a heading claims: "Questions 14-18" -> 14..18, "Questions 23 and
// 24" -> 23, 24, "Question 40" -> 40. For map-printed sets this is the only
// place the numbers exist.
export function headingNumbers(heading: string): number[] {
  const m = /(\d{1,2})\s*(?:[-–—]\s*|and\s+)?(\d{1,2})?/.exec(heading);
  if (!m) return [];
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  if (to < from || to - from > 40) return [from];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// The numbers written as gaps in the set's own text — answerable in place.
export function gapNumbers(group: QuestionGroup): number[] {
  const found = new Set<number>();
  const scan = (text: string) => {
    for (const m of text.matchAll(GAP)) if (m[1]) found.add(Number(m[1]));
  };
  for (const option of group.optionList?.options ?? []) scan(option.text);
  for (const item of group.items) {
    scan(item.text);
    for (const option of item.options) scan(option.text);
  }
  for (const block of group.body) {
    if (block.kind === "table") block.rows.forEach((r) => r.cells.forEach(scan));
    else scan(block.text);
  }
  return [...found].sort((a, b) => a - b);
}

// The numbers a group covers: every item number plus every gap number. A
// multi-answer item counts for each of its boxes. Used for fallback headings
// and verification (verify.ts).
export function groupNumbers(group: QuestionGroup): number[] {
  const found = new Set<number>();
  for (const item of group.items) {
    if (item.n !== null) {
      for (let i = 0; i < Math.max(1, item.select); i++) found.add(item.n + i);
    }
    for (const m of item.text.matchAll(GAP)) if (m[1]) found.add(Number(m[1]));
  }
  const scan = (text: string) => {
    for (const m of text.matchAll(GAP)) if (m[1]) found.add(Number(m[1]));
  };
  for (const block of group.body) {
    if (block.kind === "table") block.rows.forEach((r) => r.cells.forEach(scan));
    else scan(block.text);
  }
  return [...found].sort((a, b) => a - b);
}
