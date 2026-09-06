// Shared types for the PDF pipeline: extraction (extract.ts) produces PageResult[],
// splitting (split.ts) consumes them into TestSkills, and each TestSkill is then
// subdivided into its Parts (parts.ts).

import type { AnswerKey, QuestionGroup } from "@/lib/questions";

export type PageSource = "text" | "ocr" | "empty";

export type PageResult = {
  page: number;
  text: string;
  source: PageSource;
};

export type Progress = {
  page: number;
  totalPages: number;
  phase: "text" | "ocr";
};

// The four skills every IELTS test is made of, in the order the books print them.
export type Skill = "Listening" | "Reading" | "Writing" | "Speaking";

// A part's questions, read out of its text by lib/analyze. Absent when the
// part was never analysed or the analysis failed — `text` is the fallback.
export type PartQuestions = {
  questions: string; // the question groups as text, "" if none were found
  groups?: QuestionGroup[]; // those questions as structure, when structuring succeeded
  imagePages: number[]; // pages the API asked to see as images
};

// A reading part, which also has the passage the questions are about, split off
// from them so the two can be shown side by side the way the exam does.
export type Reading = PartQuestions & {
  passage: string; // the passage on its own, "" if none was found
};

// A listening part: no passage (the recording is heard, not printed). Any map
// its questions are answered against is carried on the question group itself.
export type Listening = PartQuestions;

// A writing task's prompt, read by lib/analyze. Task 2 only — Task 1 is a
// chart kept as a page image.
export type Writing = {
  prompt: string; // the task description on its own, "" if none was found
};

// One part of a skill: Listening Part 1-4, Reading Passage 1-3, Writing Task 1-2.
export type Part = {
  index: number; // 1-based order within the skill
  label: string; // "Part 1" / "Reading Passage 2" / "Task 1"
  expectedQuestions: number | null; // 10 / 13 / 14; null for Writing tasks & fallbacks
  startPage: number; // inclusive, 1-based
  endPage: number; // inclusive, 1-based
  text: string; // formatted (formatText output)
  images?: string[]; // rendered page images (data URLs) — Writing Task 1 only
  reading?: Reading; // passage/questions split — Reading parts only
  listening?: Listening; // the questions as read — Listening parts only
  writing?: Writing; // the task description as read — Writing Task 2 only
};

export type TestSkill = {
  test: number; // 1..4
  skill: Skill | null; // null when a test's skills couldn't be located
  startPage: number; // inclusive, 1-based
  endPage: number; // inclusive, 1-based (of the passages/questions, excluding answers)
  text: string; // whole-skill formatted text (fallback/preview), answers excluded
  parts: Part[]; // [] when the skill couldn't be subdivided
  answers: string | null; // formatted answer-key text, or null if the book had none
  answerKey?: AnswerKey; // the answers as markable entries (lib/questions/key.ts);
  // absent when the book had no key or reading it failed
};
