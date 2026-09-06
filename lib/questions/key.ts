// The book's answers, as something a student's sheet can be marked against: one
// entry per numbered box, carrying every form of the answer the book allows.
// Reading it is the model's job (lib/claude/answers.ts); this is the reply's
// shape, its coercion, and the pure marking logic.

// One numbered box of the key.
export type KeyAnswer = {
  n: number; // the printed question number, 1..40
  printed: string; // the answer exactly as the book prints it, e.g. "(the) blue whale"
  // Every form that counts as right, written out in full — marking is a plain
  // comparison against this list.
  accept: string[];
  // The numbers sharing one unordered pool ("23 & 24 IN EITHER ORDER"); same
  // `accept` and `group` for every member. Absent for an ordinary question.
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

// How an answer is compared. IELTS marks spelling, so only case, punctuation
// and hyphen-vs-space are forgiven — no stemming, no synonyms. Anything else
// the book allows is written out in `accept`.
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

// The accepted forms, cleaned: blanks dropped, duplicates collapsed. A bare
// string reply is taken as one form.
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

// Read the model's JSON reply into an AnswerKey. Coerces rather than asserts —
// half a key marks half a paper. Duplicate numbers keep their first reading.
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

// The numbers between the key's first and last with no answer. The books number
// straight through 1-40, so a hole is a line the model skipped. Used to decide
// whether a key is worth retrying (lib/claude/steps.ts).
export function keyGaps(key: AnswerKey): number[] {
  if (key.length === 0) return [];
  const have = new Set(key.map((a) => a.n));
  const missing: number[] = [];
  for (let n = key[0].n; n <= key[key.length - 1].n; n++) {
    if (!have.has(n)) missing.push(n);
  }
  return missing;
}

// The verdict spellings a True/False/Not Given box takes, mapped to what they
// mean — "T", "NG" and "Not Given" all mean the same.
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

// The verdict an answer is, when it is one; null otherwise. Only a whole answer
// counts, so "t" never matches "(the) tea".
function verdictOf(value: string): string | null {
  return VERDICTS[normalizeAnswer(value)] ?? null;
}

// Whether one answer matches one key entry (adding the verdict equivalence).
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

// Mark a sheet against the key. Unordered sets ("23 & 24 IN EITHER ORDER") are
// marked as a pool: either number may hold either answer, each counting once.
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
