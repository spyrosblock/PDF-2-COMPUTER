// Prompts for reading extraction: separate passage from questions, and keep
// question sets intact — a judgement call, so it goes to the model. Three
// steps: passage, questions (with a clarity check), questions per page. The
// prompts live here, not in the routes, so their shared description of the
// input format stays in one place. Shared fragments in shared.ts; listening's
// equivalents in listening.ts.

import { INPUT_FORMAT, LAYOUT_RULE, type QuestionPrompts } from "./shared";

// What counts as the questions, as opposed to the passage.
const WHAT_QUESTIONS_ARE = `The questions are everything that is not the passage: each "Questions X-Y" group heading, the instructions under it (word limits, "Choose TWO letters", lists of headings or features), and the numbered questions themselves with their options, tables, notes, summaries and diagram labels.`;

// Prompt shape, learned the hard way: what-to-return before exclusions, and no
// "output NONE" escape hatch in the whole-part prompts (the model takes it and
// answers NONE for text it plainly contains). Only the per-page prompt keeps
// the hatch — there, most pages really are all passage, and the caller has to
// be able to tell that apart.

export function passagePrompt(text: string): string {
  return `You are digitising one part of an IELTS Academic Reading test so a student can sit it on screen.

${INPUT_FORMAT}

Return ONLY the reading passage: its title, its subtitle if it has one, and its paragraphs, copied word for word and in printed order. Keep the paragraph letters (A, B, C ...) when the passage is lettered, and separate paragraphs with a blank line.

Leave out the "READING PASSAGE n" heading, the "You should spend about 20 minutes..." instruction, every question and question instruction, the page banners, and the running headers and footers.

Output the passage and nothing else — no preamble, no commentary, no markdown fences.

--- extracted text ---
${text}`;
}

// Step 2a. The model accepts the text or asks for pages as images. Small fixed
// reply; the questions themselves are fetched separately.
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

// Step 2b. One page at a time, once the model has asked for pages. The image is
// attached only for pages it asked for.
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
