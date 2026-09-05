// Prompt fragments and reply shapes shared by the reading and listening
// extractions.
//
// Both skills are digitised the same way. lib/pdf flattens one part of a test
// into a single run of text — faithful to the words, but carrying every artefact
// a PDF text layer leaves behind — and the model is asked to tell the questions
// out of it and lay them back out the way the book prints them. So the
// description of that input, and of what a faithful layout looks like, has to
// read identically in every prompt that mentions it; that is what lives here.
// Anything specific to one skill stays in reading.ts / listening.ts.

// The two skills whose questions are digitised. Writing has no question sets to
// read (its tasks are a prompt and a picture), and Speaking is out of scope.
export type QuestionSkill = "Reading" | "Listening";

// What the extracted text looks like. This has to spell out that the artefacts
// are to be REMOVED, not merely disregarded: an earlier version said "ignore the
// artefacts; they are not part of the test", and the model read that as "don't be
// confused by them" and copied every " | " straight through into its answer.
export const INPUT_FORMAT = `The text was pulled out of a PDF's text layer, so it does not read the way the page is printed. It carries artefacts of the extraction which you must strip out rather than reproduce:
- "--- start of page N ---" banners marking where each printed page begins.
- Running headers and footers: the publisher's name and ISBN line, a website address, a bare page number.
- " | " wherever the extractor met a wide horizontal gap. In a real table it marks a column break; elsewhere it merely separates a label from the text beside it. The "|" character is never printed on the page, so it must never appear in your answer.
- Broken layout: sentences split across two lines, and conversely whole blocks — notes, bullet lists, tables — run together into one paragraph.`;

// How the questions should come back. A student has to be able to answer from
// this, so the printed layout matters as much as the words: the extraction
// flattens a notes block into one paragraph and splits single questions across
// two lines, and both have to be undone.
export const LAYOUT_RULE = `Lay the questions out as they are printed, undoing the damage the extraction did:
- Every group heading, every instruction line, every numbered question and every bullet or note line starts on a line of its own.
- Rejoin any sentence the extraction broke across two lines, and split apart any block it ran together.
- Where " | " separated a label from the text beside it (an option letter, a TRUE/FALSE/NOT GIVEN heading, a question number), drop the bar and keep them on one line. Where it separated real table columns, keep the row on one line and separate the cells with a tab.
- Keep the gap markers in completion questions — the (7) numbering and the run of dots — as printed.
Restore the layout only: never reword, never renumber, never summarise. The words themselves are copied exactly.`;

// The check reply, once parsed: either the text passed, or these pages are wanted
// as images.
export type QuestionsCheck =
  | { status: "ok" }
  | { status: "need-pages"; pages: number[] };

// Read the model's check reply. Anything we can't make sense of is treated as
// "ok" by the caller — see lib/claude/extract.ts.
export function parseCheck(reply: {
  text_status?: unknown;
  request_page?: unknown;
}): QuestionsCheck | null {
  const requested = reply.request_page;
  if (typeof requested === "string" || typeof requested === "number") {
    const pages = String(requested)
      .split(/[,\s]+/)
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (pages.length > 0) return { status: "need-pages", pages };
  }
  if (typeof reply.text_status === "string") return { status: "ok" };
  return null;
}

// Whether a page's extracted text plainly carries questions — a "Questions 7-13"
// group heading, or numbered lines of the kind a question set is made of. Used to
// tell a page that legitimately has none (all passage, or a page of audio
// instructions) from one where an empty answer must be the model slipping, so
// only the latter is asked again.
export function looksLikeQuestions(text: string): boolean {
  return /\bquestions?\s*\d/i.test(text) || /^\s*\d{1,2}[.)]\s+\S/m.test(text);
}

// The three prompts a skill's question extraction is made of. Each skill supplies
// its own set (reading.ts, listening.ts) and lib/claude/extract.ts runs them.
export type QuestionPrompts = {
  check: (text: string) => string;
  extract: (text: string) => string;
  page: (page: number, text: string, hasImage: boolean) => string;
};
