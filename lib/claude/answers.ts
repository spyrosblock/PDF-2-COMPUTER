// The prompt that turns a skill's printed answer key into something markable.
//
// lib/pdf/answers.ts peels the key off the end of each Listening and Reading
// skill, but only as text: the page as the extractor left it, columns
// interleaved, running headers still in it, and the answers themselves written
// the way an examiner reads them rather than the way a comparison does —
// "(the) blue whale", "car park OR parking lot", "23 & 24 IN EITHER ORDER B E".
//
// This step reads that page into one entry per numbered box, with every form the
// book allows written out in full, so marking a student's sheet is a lookup and
// nothing cleverer (lib/questions/key.ts). The expansion is the whole point of
// asking a model rather than a regex: the parentheses, the ORs and the unordered
// pairs are printed conventions, and each of them means "these other strings are
// also right".
//
// The fidelity rule is the same as the question extraction's, and matters as much:
// an invented alternative marks a wrong answer right, and a dropped one marks a
// right answer wrong. The model expands what is printed and adds nothing.

import { INPUT_FORMAT, type QuestionSkill } from "./shared";

const SCHEMA = `{
  "answers": [
    {
      "n": 7,
      "printed": "(the) blue whale",
      "accept": ["the blue whale", "blue whale"],
      "group": null
    }
  ]
}`;

const RULES = `One entry per numbered box, in ascending order of "n".

"n" is the printed question number. A Listening or Reading key numbers its answers straight through from 1 to 40; give every number the page prints, and no number it does not.

"printed" is the answer copied exactly as the book prints it, parentheses, capitals, slashes and all. It is what the student is shown after marking, so it must read the way the book reads.

"accept" is that same answer written out as every string that is to be counted correct — a full answer per entry, never a pattern, never a placeholder, never an empty string. Expand exactly these printed conventions and nothing else:
- Words in parentheses are optional: "(the) blue whale" accepts "the blue whale" and "blue whale". Where a line has two optional pieces, list every combination.
- "OR", "or" and a slash BETWEEN two whole answers separate alternatives: "car park OR parking lot" accepts both. A slash inside a word, a number or a date ("24/7", "1950/51") is part of the answer, not an alternative.
- The two combine: "(the) car park OR (a) parking lot" gives four accepted strings.
- A letter answer stays the letter as printed ("B"), a Roman numeral stays as printed ("iv"), and TRUE / FALSE / NOT GIVEN, YES / NO / NOT GIVEN stay as printed.
Nothing else is expanded. Never add a synonym, a plural, a spelling variant, an article, a rewording or a "close enough" form of your own: if the book does not print it, it is not accepted. Case, surrounding punctuation and hyphen-versus-space are handled by the marker, so they need no entries of their own.

"group" is for the sets the books print as unordered — "23 & 24 IN EITHER ORDER", "IN ANY ORDER" over three or more numbers, "31-33 IN ANY ORDER". Give one entry per number in the set; each carries the SAME "accept" list — every answer of the pool — and the same "group", the list of numbers sharing it. For every ordinary question "group" is null.

A box whose answer is two things at once ("31 name and address") is one answer, not a group: keep it as printed.`;

const IGNORE = `The page carries more than the key. Read the numbered answers only, and ignore:
- Any band-score or scoring table ("If you score…", "0-15", "Band 5"), and the advice printed around it.
- Audioscripts, tapescripts and transcripts of the recording.
- Sample answers to Writing tasks, and any commentary or examiner's notes on them.
- The key for a different skill or a different test, if part of one has been swept in: only answers for this skill's own 1-40 belong here.
- Running headers, footers, ISBN lines and page banners.

Answer keys are printed in two or three columns, so the extraction interleaves them: "1 B" may be followed by "21 C" and only later by "2 A". Read every numbered answer wherever it falls on the page and order them by number.

If the page carries no numbered answers at all, reply with {"answers": []}.`;

export function answerKeyPrompt(text: string, skill: QuestionSkill): string {
  return `You are digitising the answer key of an IELTS ${skill} test so a student's typed answers can be marked automatically. Below is the key as it was pulled out of the book, followed by nothing you need to write back except its answers.

${INPUT_FORMAT}

Reply with ONE JSON object of this shape and nothing else:
${SCHEMA}

${RULES}

${IGNORE}

Output the JSON object and nothing else — no preamble, no commentary, no markdown fences.

--- the answer key ---
${text}`;
}
