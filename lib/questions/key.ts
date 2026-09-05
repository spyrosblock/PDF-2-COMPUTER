// The book's own answers, as something a student's sheet can be marked against.
//
// lib/pdf/answers.ts peels the answer key off the end of each Listening and
// Reading skill and keeps it as the page it is printed on: "1 B", "7 (the) blue
// whale", "23 & 24 IN EITHER ORDER B E", wrapped in running headers and followed
// by whatever else the book prints back there. That is enough to show a student,
// and no use at all for marking — it is text, and the thing it has to be compared
// against is a Record<question number, what the student typed> (lib/answers.ts).
//
// This is that key named: one entry per numbered box, carrying every form of the
// answer the book allows. The reading of it is the model's (lib/claude/answers.ts);
// everything here is the shape it comes back in, the coercion of that reply, and
// the marking itself — which is pure, so it runs equally on the server and in the
// page that shows a student their score.

// One numbered box of the key.
export type KeyAnswer = {
  n: number; // the printed question number, 1..40
  printed: string; // the answer exactly as the book prints it, e.g. "(the) blue whale"
  // Every form that is to be counted right, written out in full: the optional
  // words of "(the) blue whale" both kept and dropped, the alternatives of
  // "car park OR parking lot" one per entry. Marking is a comparison against
  // this list and nothing cleverer, so anything the book allows has to be in it.
  accept: string[];
  // The numbers this answer shares a pool with, when the book prints them as one
  // unordered set ("23 & 24 IN EITHER ORDER"). Every number of such a set carries
  // the same `accept` list and the same `group`; absent for an ordinary question.
  group?: number[];
};

// A whole skill's key — Listening or Reading, questions 1-40 — in printed order.
export type AnswerKey = KeyAnswer[];

// What the student wrote, as lib/answers.ts keeps it: question number -> answer.
// Typed structurally rather than imported, so marking doesn't drag the client
// store (and its localStorage) into the server bundle.
type Sheet = Record<string, string>;

// How one box was marked.
export type Mark = {
  n: number;
  given: string; // what the student wrote; "" if they left it blank
  correct: boolean;
  printed: string; // the book's answer, to show beside a wrong one
};

export type Marking = {
  marks: Mark[];
  correct: number;
  answered: number; // boxes with something in them
  total: number; // boxes the key has
};

// How an answer is compared. IELTS marks spelling, so this stays deliberately
// close to the letter: case and surrounding punctuation are the examiner's to
// ignore, and a hyphen where the book prints a space (or the other way round) is
// not what the question was testing. Nothing else is forgiven — no stemming, no
// synonyms, no articles quietly added or dropped. Those the book itself allows,
// and where it does they are written out in `accept`.
export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[-‐-―]/g, " ")
    .replace(/[.,;:!?"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 40
    ? n
    : null;
}

// The accepted forms, cleaned: strings only, blanks dropped, duplicates (once
// normalized) collapsed. A model that answers "accept": "B" rather than ["B"] is
// taken at its word rather than dropped.
function accepted(value: unknown, printed: string): string[] {
  const raw = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const text = str(item);
    if (!text) continue;
    const key = normalizeAnswer(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  // A key entry with no usable alternatives still marks something if the printed
  // form is plain enough to compare — "B", "TRUE", "iv" nearly always are.
  if (out.length === 0 && printed && normalizeAnswer(printed)) out.push(printed);
  return out;
}

function group(value: unknown, n: number): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = [...new Set(value.map(num).filter((v): v is number => v !== null))];
  if (!numbers.includes(n)) numbers.push(n);
  numbers.sort((a, b) => a - b);
  return numbers.length > 1 ? numbers : undefined;
}

// Read the model's JSON reply into an AnswerKey.
//
// Like lib/questions/parse.ts this coerces rather than asserts: half a key marks
// half a paper, which is worth more to the student than nothing. An entry is
// dropped only when it has no usable question number or nothing to compare
// against, and a number the reply gives twice keeps its first (printed order)
// reading — a key that repeats itself is a misread, not two answers.
export function parseAnswerKey(reply: unknown): AnswerKey {
  const raw = reply && typeof reply === "object" ? (reply as { answers?: unknown }) : null;
  const list = Array.isArray(raw?.answers) ? raw.answers : [];

  const key: AnswerKey = [];
  const seen = new Set<number>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as {
      n?: unknown;
      printed?: unknown;
      answer?: unknown;
      accept?: unknown;
      group?: unknown;
    };
    const n = num(e.n);
    if (n === null || seen.has(n)) continue;
    const printed = str(e.printed ?? e.answer);
    const accept = accepted(e.accept, printed);
    if (accept.length === 0) continue;
    seen.add(n);
    key.push({ n, printed: printed || accept[0], accept, group: group(e.group, n) });
  }
  return key.sort((a, b) => a.n - b.n);
}

// The numbers between the key's first and last that it never gives an answer
// for. A key read off the page should have none: the books number their answers
// straight through 1-40, so a hole is a line the model skipped rather than a
// question the book forgot. Used to decide whether a key is worth asking for
// again (lib/claude/steps.ts).
export function keyGaps(key: AnswerKey): number[] {
  if (key.length === 0) return [];
  const have = new Set(key.map((a) => a.n));
  const missing: number[] = [];
  for (let n = key[0].n; n <= key[key.length - 1].n; n++) {
    if (!have.has(n)) missing.push(n);
  }
  return missing;
}

// The one-word verdicts a True/False/Not Given (or Yes/No/Not Given) box takes,
// mapped to what they mean. The books print TRUE / FALSE / NOT GIVEN and
// YES / NO / NOT GIVEN; a student sitting the paper types T, NG, Not Given —
// and all the spellings of a verdict mean the same thing.
const VERDICTS: Record<string, string> = {
  true: "true",
  t: "true",
  false: "false",
  f: "false",
  "not given": "not given",
  ng: "not given",
  "n/g": "not given",
  "n g": "not given",
  yes: "yes",
  y: "yes",
  no: "no",
  n: "no",
};

// The verdict an answer is, when it is one; null when it is anything else. Only
// a whole answer that is exactly a verdict word counts, so a key of "(the) tea"
// is never matched by a student's "t" — a completion answer isn't a verdict.
function verdictOf(value: string): string | null {
  return VERDICTS[normalizeAnswer(value)] ?? null;
}

// Whether one answer matches one entry of the key.
//
// Case and punctuation are already forgiven by normalizeAnswer; this adds the
// one equivalence the verdict boxes need, so "T" is marked against "TRUE" and
// "NG" against "Not Given" as the same answer.
function matches(given: string, entry: KeyAnswer): string | null {
  const wrote = normalizeAnswer(given);
  if (!wrote) return null;
  const wroteVerdict = verdictOf(given);
  for (const form of entry.accept) {
    const normalized = normalizeAnswer(form);
    if (normalized === wrote) return normalized;
    const formVerdict = verdictOf(form);
    if (wroteVerdict !== null && formVerdict === wroteVerdict) {
      return formVerdict;
    }
  }
  return null;
}

// Mark a sheet against the key.
//
// Ordinary boxes are a lookup. The unordered sets the books print — "23 & 24 IN
// EITHER ORDER: B, E" — are marked as a pool instead: either number may hold
// either answer, and each answer counts once, so a student who writes B in both
// boxes has one right rather than two. The pool is consumed in printed order,
// which for a set of letters (what these sets always are in practice) is the same
// as consuming it optimally.
export function markSheet(key: AnswerKey, sheet: Sheet): Marking {
  const used = new Map<string, Set<string>>(); // group key -> forms already counted

  const marks = key.map((entry) => {
    const given = (sheet[String(entry.n)] ?? "").trim();
    const matched = matches(given, entry);
    let correct = matched !== null;

    if (correct && entry.group) {
      const id = entry.group.join(",");
      const spent = used.get(id) ?? new Set<string>();
      if (spent.has(matched!)) correct = false;
      else spent.add(matched!);
      used.set(id, spent);
    }

    return { n: entry.n, given, correct, printed: entry.printed };
  });

  return {
    marks,
    correct: marks.filter((m) => m.correct).length,
    answered: marks.filter((m) => m.given !== "").length,
    total: marks.length,
  };
}
