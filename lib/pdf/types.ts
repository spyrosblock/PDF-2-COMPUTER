// Shared types for the PDF pipeline: extraction (extract.ts) produces PageResult[],
// splitting (split.ts) consumes them into TestSkills, and each TestSkill is then
// subdivided into its Parts (parts.ts).

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

// One part of a skill: Listening Part 1-4, Reading Passage 1-3, Writing Task 1-2.
export type Part = {
  index: number; // 1-based order within the skill
  label: string; // "Part 1" / "Reading Passage 2" / "Task 1"
  expectedQuestions: number | null; // 10 / 13 / 14; null for Writing tasks & fallbacks
  startPage: number; // inclusive, 1-based
  endPage: number; // inclusive, 1-based
  text: string; // formatted (formatText output)
};

export type TestSkill = {
  test: number; // 1..4
  skill: Skill | null; // null when a test's skills couldn't be located
  startPage: number; // inclusive, 1-based
  endPage: number; // inclusive, 1-based (of the passages/questions, excluding answers)
  text: string; // whole-skill formatted text (fallback/preview), answers excluded
  parts: Part[]; // [] when the skill couldn't be subdivided
  answers: string | null; // formatted answer-key text, or null if the book had none
};
