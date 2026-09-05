// Prompts for reading extraction, and the reply shapes they ask for.
//
// A Cambridge reading part is printed as one continuous run: the passage, then
// the question groups. lib/pdf gets us that run as text (formatText output), but
// it is a flattened text layer — page banners, running headers, and tables
// rebuilt as " | " rows — so telling passage from questions, and keeping a
// question set intact, is a judgement call rather than a regex. That is what we
// ask Claude to do, in the three steps app/api/reading exposes:
//
//   1. passage       — the passage text on its own
//   2. questions     — is the questions text clear enough? if so, the questions
//   3. questions/page— when it isn't: one page at a time, with the page image
//
// The prompts live here (not in the routes) because all three describe the same
// input format, and that description has to stay identical across them. The
// fragments both skills share are in shared.ts; the listening equivalents of
// steps 2 and 3 are in listening.ts.

import { INPUT_FORMAT, LAYOUT_RULE, type QuestionPrompts } from "./shared";

// What counts as the questions, as opposed to the passage.
const WHAT_QUESTIONS_ARE = `The questions are everything that is not the passage: each "Questions X-Y" group heading, the instructions under it (word limits, "Choose TWO letters", lists of headings or features), and the numbered questions themselves with their options, tables, notes, summaries and diagram labels.`;

// A note on shape, learned the hard way against this endpoint. Each prompt opens
// with what to return, then what to leave out, then the text — putting the
// exclusions first made the model answer NONE for a passage it had reproduced
// perfectly a moment earlier.
//
// And an "output NONE instead" escape hatch is dangerous: offer one for something
// the input plainly contains and the model takes it. The whole-part prompts asked
// for one and got NONE back — reproducibly for the questions, intermittently for
// the passage — so neither carries one now; an empty answer is simply read as
// "nothing found". Only the per-page prompt keeps the hatch, because there it
// earns its place: most pages of a part really are all passage and no questions,
// and that is the one case the caller has to be able to tell apart.

export function passagePrompt(text: string): string {
  return `You are digitising one part of an IELTS Academic Reading test so a student can sit it on screen.

${INPUT_FORMAT}

Return ONLY the reading passage: its title, its subtitle if it has one, and its paragraphs, copied word for word and in printed order. Keep the paragraph letters (A, B, C ...) when the passage is lettered, and separate paragraphs with a blank line.

Leave out the "READING PASSAGE n" heading, the "You should spend about 20 minutes..." instruction, every question and question instruction, the page banners, and the running headers and footers.

Output the passage and nothing else — no preamble, no commentary, no markdown fences.

--- extracted text ---
${text}`;
}

// Step 2a. The model either accepts the text or asks for whole pages as images
// it can read itself. Kept to a small fixed reply so nothing long has to survive
// JSON escaping; the questions themselves are fetched separately.
export function questionsCheckPrompt(text: string): string {
  return `You are digitising one part of an IELTS Academic Reading test.

${INPUT_FORMAT}

${WHAT_QUESTIONS_ARE}

Judge whether the extracted text of the QUESTIONS is clear and complete enough to reproduce the questions faithfully. It is NOT clear enough if question text is garbled or truncated, options are missing, numbering has gaps, or a table, summary, flow-chart or diagram has lost the structure a student needs to answer it. Judge the questions only — an imperfect passage does not matter here.

Reply with ONE JSON object and nothing else, either:
{"text_status": "ok"}
if the questions text is good enough, or:
{"request_page": "12, 13"}
to be given whole pages as images, which you will read yourself. Use the page numbers exactly as they appear in the "--- start of page N ---" banners, comma separated, and ask only for pages whose questions you could not read.

--- extracted text ---
${text}`;
}

export function questionsExtractPrompt(text: string): string {
  return `You are digitising one part of an IELTS Academic Reading test so a student can sit it on screen.

${INPUT_FORMAT}

${WHAT_QUESTIONS_ARE}

Return ONLY the questions, copied word for word and in printed order. Keep every group heading ("Questions 14-18"), every instruction line under it, the question numbers, and every option, heading list, table row, note or diagram label a student needs in order to answer. Leave out the reading passage itself, the page banners, and the running headers and footers.

${LAYOUT_RULE}

Output the questions and nothing else — no preamble, no commentary, no markdown fences.

--- extracted text ---
${text}`;
}

// Step 2b. One page at a time, once the model has asked for pages. The page image
// is attached when this is one of the pages it asked for; otherwise it works from
// the page's text alone.
export function questionsPagePrompt(
  page: number,
  text: string,
  hasImage: boolean,
): string {
  const source = hasImage
    ? `The attached image is the whole of printed page ${page}. You asked for it because the extracted text of this page was not clear enough — read the questions off the image, and use the extracted text below only to resolve anything the image leaves ambiguous.`
    : `Below is the extracted text of printed page ${page}.`;

  return `You are digitising one part of an IELTS Academic Reading test so a student can sit it on screen, and you are working through it one page at a time. This is page ${page}.

${source}

${INPUT_FORMAT}

${WHAT_QUESTIONS_ARE}

Return ONLY the questions printed on THIS page, word for word and in printed order. Keep every group heading ("Questions 14-18"), every instruction line under it, the question numbers, and every option, heading list, table row, note or diagram label a student needs in order to answer.

Leave out the reading passage, the page banners, and the running headers and footers. Do not repeat questions from other pages, and do not invent questions that are not printed here.

${LAYOUT_RULE}

Output the questions and nothing else — no preamble, no commentary, no markdown fences. Some pages of a reading part are all passage and carry no questions at all; if this is one of them, output exactly: NONE

--- extracted text of page ${page} ---
${text}`;
}

// The three prompts as lib/claude/extract.ts runs them.
export const READING_PROMPTS: QuestionPrompts = {
  check: questionsCheckPrompt,
  extract: questionsExtractPrompt,
  page: questionsPagePrompt,
};
