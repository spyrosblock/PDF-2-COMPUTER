// The prompt that turns a part's extracted question text into question groups.
//
// The extraction step (reading.ts, listening.ts) gets the questions out of the
// PDF word for word, but as one flat run of text: the heading, the instructions,
// the box of headings and the numbered questions all arrive as undifferentiated
// lines. A student can read it, but it does not look like the page they will sit
// the exam on, and nothing in it can be answered or marked.
//
// This step names the structure that was already printed there: where each set
// starts, which type it is, which lines are its instructions, which list its
// questions all draw on, and where each gap falls. It is a re-description, not a
// rewrite — see the fidelity rule below, which is the part of this prompt that
// matters most. Reworded IELTS questions look fine and quietly stop matching the
// book's answer key.
//
// Reading and listening share it, because a question set is built the same way in
// both; only the type list and the words for where the answers come from differ.
// The reply is JSON, read by lib/questions/parse.ts into QuestionGroup[].

import { QUESTION_TYPES } from "@/lib/questions";
import type { QuestionSkill } from "./shared";

// Everything about the prompt that turns on which skill's questions these are.
// The type list is the real difference: True/False/Not Given, matching headings
// and matching information are reading's alone, and a model given the whole list
// for a listening set has reached for them.
type SkillWording = {
  test: string; // "IELTS Academic Reading test"
  source: string; // where the answers come from: "the passage" / "the recording"
  types: string; // the type guide
  extra: string; // anything only this skill needs said
};

const READING: SkillWording = {
  test: "IELTS Academic Reading test",
  source: "the passage",
  types: `- "multiple-choice" — choose one option (A-D) per question, or several from a longer list.
- "true-false-not-given" — decide whether a statement agrees with the facts in the passage.
- "yes-no-not-given" — the same, judged against the writer's views or claims.
- "matching-information" — find which lettered paragraph contains a given piece of information.
- "matching-headings" — give each paragraph a heading from a list of Roman numerals.
- "matching-features" — match statements to a list of lettered features (people, dates, theories).
- "matching-sentence-endings" — complete each sentence beginning with an ending from a list.
- "sentence-completion" — fill a gap in a sentence with words from the passage, under a word limit.
- "summary-completion" — fill gaps in a summary, a set of notes, a table or a flow-chart, either with words from the passage or from a word bank.
- "diagram-labelling" — label a diagram with words from the passage.
- "short-answer" — answer a question with words from the passage, under a word limit.
- "other" — a set that is none of these.`,
  extra: `Never put the passage's paragraph letters in "optionList" when the questions ask which paragraph contains something; that list is not printed.`,
};

const LISTENING: SkillWording = {
  test: "IELTS Listening test",
  source: "the recording",
  types: `- "multiple-choice" — choose one option (A, B or C) per question, or several from a longer list ("Choose TWO letters, A-E").
- "matching-features" — match each numbered item to a lettered option from a list the whole set shares.
- "sentence-completion" — fill a gap in a sentence with words from the recording, under a word limit.
- "summary-completion" — fill numbered gaps in a form, a table, a set of notes, a flow-chart or a summary. This is the commonest listening set of all; a table or a form is one of these, not a type of its own.
- "diagram-labelling" — write letters or words onto a map, a plan or a diagram printed on the page.
- "short-answer" — answer a question with words from the recording, under a word limit.
- "other" — a set that is none of these.
"true-false-not-given", "yes-no-not-given", "matching-headings", "matching-information" and "matching-sentence-endings" do not occur in IELTS Listening. Never use them here.`,
  extra: `A map, plan or diagram is a picture, and it is supplied to the student as an image — it is not in the text you are given and you must not try to describe it. For such a set, "items" are the numbered labels printed beside the picture ("16 Farm shop") and "body" stays empty.`,
};

const SCHEMA = `{
  "groups": [
    {
      "type": one of: ${QUESTION_TYPES.map((t) => `"${t}"`).join(", ")},
      "heading": the printed group heading, e.g. "Questions 14-20" ("" if the set has none),
      "instructions": [ each instruction line under the heading, verbatim, one string per line ],
      "optionList": { "title": the list's printed title or null, "options": [ { "key": "i", "text": "..." } ] },
      "body": [ the gapped summary, notes, table or flow-chart the set is built on ],
      "items": [ { "n": 14, "text": "...", "select": 1, "options": [] } ]
    }
  ]
}`;

function fieldRules(skill: SkillWording): string {
  return `"optionList" is the ONE list every question in the set chooses from: the box of headings, the list of researchers, the set of sentence endings, the word bank. Use null when there is no such list. "key" is exactly what is printed against the option — "A", "iv", "TRUE" — and "text" is the option itself.

"items" are the numbered questions, in printed order. "n" is the printed number. "text" is the statement, the sentence beginning, or the question. "select" is how many answers that question takes — 2 when the instruction says "Choose TWO letters", otherwise 1. "options" holds THAT question's own lettered options (ordinary multiple choice, where each question has its own A-D); leave it [] whenever the set shares one "optionList".

One stem often covers two numbers: "Questions 23 and 24" asks a single question whose two answers go in boxes 23 and 24. That is ONE item — "n" is the first number and "select" is 2 — never the same stem written out twice.

Nothing is written twice. A line is either an instruction, or an item, or part of the body — whichever it is printed as. The question stem of a "Choose TWO letters" set belongs with the item it asks, not in "instructions" as well.

"body" is only for a set built on a block of gapped text — a summary, notes, a form, a table, a flow-chart. Each entry is one of:
  {"kind": "heading", "text": "..."}     a title or a column of notes' own heading
  {"kind": "paragraph", "text": "..."}   a run of prose
  {"kind": "bullet", "text": "..."}      one bulleted or dashed note line
  {"kind": "table", "rows": [ {"header": true, "cells": ["...", "..."]} ]}
Use "body" for a table, a form or a flow-chart rather than flattening it into lines, and set "header" true on a row of column headings. Leave "body" as [] for every other kind of set.

Where the gaps ARE the questions — a summary, a form or a table with numbered blanks — put the gaps in "body" and leave "items" as []. Do not write the same question in both.

${skill.extra}`;
}

const GAP_RULE = `Every gap a student types into is written as [[n]], where n is the number printed against it: "In [[14]] the first bridge was built." A gap with no number is [[]]. The printed run of dots or the printed blank line is replaced by this token and never reproduced — but the gap's number is kept, since a student answers by number.`;

// The fidelity rule. This is the whole point of the step being a re-description:
// the model is being handed text it could easily improve, and must not.
const FIDELITY_RULE = `Copy the words. Every string you output is text printed in the book, copied exactly:
- Never reword a question, an option or an instruction, not even to fix awkward phrasing or a grammatical slip in the original.
- Never renumber. Keep each printed question number, even if the set starts at 14 or the numbering skips.
- Never add a question, an option or an instruction that is not printed, and never leave one out.
- Never answer the questions, and never mark which option is correct.
- Never summarise or shorten an instruction line.
The only things you add are the structure itself — which group a line belongs to, which field it goes in, the type of the set — and the [[n]] gap tokens.

What you SHOULD repair is the damage the extraction did to the layout: a sentence broken across two lines is rejoined, a table flattened into one paragraph is rebuilt into rows, an option letter separated from its option is put back beside it, and a stray page number or running header that survived into the text is dropped.`;

export function questionsStructurePrompt(
  questions: string,
  skill: QuestionSkill,
): string {
  const wording = skill === "Listening" ? LISTENING : READING;

  return `You are digitising the questions of an ${wording.test} so a student can sit it on screen. The text below was copied out of the book word for word, but flattened: the group headings, instruction lines, option lists and numbered questions all read as plain lines, and any table or set of notes has lost its shape.

Describe that same text as structured JSON, so it can be laid out on screen the way the book prints it.

A set of questions is introduced by a heading like "Questions 14-20" and followed by its own instructions. One set is one group, in printed order. The text below is usually a single set, but if it carries more than one, return one group for each. Every answer in it comes from ${wording.source}.

Question types:
${wording.types}

Reply with ONE JSON object of this shape and nothing else:
${SCHEMA}

${fieldRules(wording)}

${GAP_RULE}

${FIDELITY_RULE}

Output the JSON object and nothing else — no preamble, no commentary, no markdown fences.

--- the questions ---
${questions}`;
}
