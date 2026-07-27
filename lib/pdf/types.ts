// Shared types for the PDF pipeline: extraction (extract.ts) produces PageResult[],
// splitting (split.ts) consumes them into TestParts.

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

// The four parts every IELTS test is made of, in the order the books print them.
export type Section = "Listening" | "Reading" | "Writing" | "Speaking";

export type TestPart = {
  test: number; // 1..4
  section: Section | null; // null when a test's parts couldn't be located
  startPage: number; // inclusive, 1-based
  endPage: number; // inclusive, 1-based
  text: string;
};
