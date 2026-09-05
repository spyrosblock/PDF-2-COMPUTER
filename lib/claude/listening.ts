// Prompts for listening extraction.
//
// A listening part is the mirror image of a reading one. There is no passage to
// tell the questions from — the recording is heard, not printed, so every line on
// the page belongs to a question set — but what is printed is far harder to read
// back: forms and tables whose columns the extractor rebuilt as " | " rows, notes
// whose gaps are runs of dots, option lists whose text slides a line out of place,
// and, in Part 2, a map or plan whose labels reach us as nonsense because they
// were never text on the page at all.
//
// So the steps are the same two the reading extraction uses (app/api/listening):
//
//   1. questions      — is the questions text clear enough? if so, the questions
//   2. questions/page — when it isn't: one page at a time, with the page image
//
// but the rules under them are listening's own: the repair rule below, which is
// what makes the result read like the printed page rather than like a text layer,
// and the picture rule, which stops the model trying to spell out a map. The map
// itself is handed to the student as an image — see lib/claude/figures.ts.

import { INPUT_FORMAT, LAYOUT_RULE, type QuestionPrompts } from "./shared";

// What a listening page is made of. Spelled out because the reading prompts'
// central act — separating passage from questions — has no counterpart here, and
// a model told to "return only the questions" on a page that is nothing but
// questions has been known to return only some of them.
const WHAT_QUESTIONS_ARE = `A listening part is printed as questions and nothing else: the recording is heard, not printed, so there is no passage on the page and no line of it is anything but part of a question set. One set is a "Questions X-Y" heading, the instruction lines under it (what to write, the word limit, "Choose TWO letters"), and then whatever the student answers on — numbered questions with their options, a form, a table, a set of notes or a flow-chart carrying numbered gaps, a lettered box of options, or a numbered list of labels for a map.

Every IELTS Listening test has four parts of exactly ten questions: Part 1 asks questions 1-10, Part 2 asks 11-20, Part 3 asks 21-30 and Part 4 asks 31-40. One part is usually two or three sets of questions covering its ten numbers between them.`;

// The repair rule — the heart of these prompts.
//
// A listening page comes out of the text layer scrambled rather than merely
// dirty: the printed page is short lines in columns, so the extractor's guesses
// about which words share a line are wrong far more often than they are on a page
// of prose. The observed damage is specific and repeatable (every example below
// is a real one from a Cambridge book), and none of it can be undone line by
// line — it takes reading the set as a whole and putting each fragment back where
// it makes sense. That is a rewrite in mechanics but not in substance, so the
// rule closes by drawing that line as hard as it can: the words stay the book's.
const REPAIR_RULE = `The extraction scrambles a listening page more than it garbles it, and putting the page back together by sense — not line by line — is the work here:
- A list printed one entry per line — a set of lettered options, the numbered labels beside a map, the lines of a form — loses the tail of one entry onto the line of the next: "A take them for a walk round the / B town. go to a local restaurant. / C have a meal at home.", or "18 Adventure playground Kitchen / 19 gardens". Read the list as a whole and give each entry the words that finish it: A "take them for a walk round the town.", B "go to a local restaurant.", C "have a meal at home."; 18 "Adventure playground", 19 "Kitchen gardens". No entry may be left ending mid-phrase, and none may be left starting with the end of another. Some editions of these books are re-typeset from a scan and print this damage on the page itself, so repair it whether you are reading the extracted text or the page image.
- A heading, an instruction line or an option list printed once but extracted twice is written once.
- Where a number or a letter range is plainly mangled — "PART 4 Question 31 -10" for questions 31-40, "Choose TWO letters, A E" for A-E — put back what the page must have printed, judging from the set itself and from how IELTS Listening is numbered.
- A list of options always begins at A and runs on without a break, and the instruction's range names exactly the letters the list has. A five-option list lettered D to H has lost its opening letters somewhere in the extraction: letter it A to E and write the instruction to match ("Choose TWO letters, A-E"). The options themselves, and the order they stand in, never change.
- A word the extractor ran together, split or corrupted ("arriver" for "a river", "wasd1:1elared" for "was declared", "let t er" for "letter") is written as the word it plainly is.
- Notes and forms are printed as short labelled lines, and the extractor runs them into paragraphs. Give each note, each bullet and each row of a form its own line again.
Everything you repair is still the book's own words: you are restoring what was printed, never composing something better, and never making a question easier, harder or clearer than the book made it. Where a fragment cannot be placed with confidence, leave it where the extraction put it rather than guessing.`;

// Maps and plans. Without this the model tries to be helpful and writes the
// picture out in words — inventing labels that are not on the page, and turning a
// set of questions the student answers against a picture into unanswerable prose.
const PICTURE_RULE = `Part 2 often prints a map, a plan or a diagram, and its questions are answered by writing letters onto it. That picture is not text: its outlines, its lettered markers and often its labels reach you as nonsense — stray brackets, digits and rules such as "--<::® 9 ' 9 (::::I >:9". Keep the instruction line ("Label the map below."), keep the numbered list of places printed beside or below the picture, and drop those fragments entirely. Never redraw the picture in words, and never invent labels for it: the picture is shown to the student as an image alongside these questions.`;

// What to keep besides the questions themselves.
const KEEP_RULE = `Start at the first "Questions X-Y" heading. Do not output the part's own banner ("PART 2", "Listening") — the app labels the part itself. Where the book prints the range only on that banner because the whole part is a single set, write it as that set's heading ("Questions 1-10") on a line of its own. Where the sets below carry their own ranges, do not repeat the part's whole range as a heading above them.

Part 1 sometimes prints an Example with its answer filled in, to show the student what is wanted. Keep it exactly where and as it is printed.`;

// Step 1a. The model either accepts the text or asks for whole pages as images it
// can read itself. Listening asks for pages far more often than reading does, and
// should: a form or a map that came out as rubble is unanswerable, whereas a
// paragraph of prose with a few broken words is not.
export function questionsCheckPrompt(text: string): string {
  return `You are digitising one part of an IELTS Listening test.

${INPUT_FORMAT}

${WHAT_QUESTIONS_ARE}

Judge whether the extracted text is clear and complete enough to reproduce this part's questions faithfully. It is NOT clear enough if question text is garbled or truncated, options are missing or have plainly slid out of place, the ten question numbers do not all appear, or a form, table, set of notes or flow-chart has lost the structure a student needs in order to answer it. A map, plan or diagram losing its shape does not count on its own — the picture is supplied to the student separately — but the numbered questions printed around it must still be readable.

Reply with ONE JSON object and nothing else, either:
{"text_status": "ok"}
if the text is good enough, or:
{"request_page": "12, 13"}
to be given whole pages as images, which you will read yourself. Use the page numbers exactly as they appear in the "--- start of page N ---" banners, comma separated, and ask only for pages whose questions you could not read.

--- extracted text ---
${text}`;
}

export function questionsExtractPrompt(text: string): string {
  return `You are digitising one part of an IELTS Listening test so a student can sit it on screen.

${INPUT_FORMAT}

${WHAT_QUESTIONS_ARE}

Return this part's questions as the book prints them, in printed order: every group heading ("Questions 11-16"), every instruction line under it, every question number, and every option, box of lettered choices, table row, note line, form field and gap a student needs in order to answer.

${KEEP_RULE}

${LAYOUT_RULE}

${REPAIR_RULE}

${PICTURE_RULE}

Output the questions and nothing else — no preamble, no commentary, no markdown fences.

--- extracted text ---
${text}`;
}

// Step 1b. One page at a time, once the model has asked for pages. The page image
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

  return `You are digitising one part of an IELTS Listening test so a student can sit it on screen, and you are working through it one page at a time. This is page ${page}.

${source}

${INPUT_FORMAT}

${WHAT_QUESTIONS_ARE}

Return the questions printed on THIS page, in printed order: every group heading, every instruction line under it, every question number, and every option, box of lettered choices, table row, note line, form field and gap a student needs in order to answer. Do not repeat questions from other pages, and do not invent questions that are not printed here — if a set begins on this page and runs onto the next, give only the part of it printed here.

${KEEP_RULE}

${LAYOUT_RULE}

${REPAIR_RULE}

${PICTURE_RULE}

Output the questions and nothing else — no preamble, no commentary, no markdown fences. A page of a listening part occasionally carries no questions at all — a cover page, or a page holding nothing but a map; if this is one of them, output exactly: NONE

--- extracted text of page ${page} ---
${text}`;
}

// The three prompts as lib/claude/extract.ts runs them.
export const LISTENING_PROMPTS: QuestionPrompts = {
  check: questionsCheckPrompt,
  extract: questionsExtractPrompt,
  page: questionsPagePrompt,
};
