"use client";

// Turning one listening part into a set of questions.
//
// A listening part has no passage — the recording is heard, not printed — so
// there is nothing to separate: the whole part is questions, and the work is
// reading them back off a page the text layer mangles badly. Forms and tables
// arrive as " | " rows, notes run together into paragraphs, option lists slide a
// line out of place, and Part 2's map reaches us as rubble. What comes back is
// the book's own wording put back where it belongs (lib/claude/listening.ts),
// then described as question groups so the page can lay it out the way the book
// does:
//
//   1. POST /api/listening/questions          -> either the questions, or a list
//                                                of pages the model wants to see
//   2. POST /api/listening/questions/page     -> when it asked: the part's pages
//                                                one at a time, with the requested
//                                                ones rendered from the PDF
//   3. POST /api/listening/questions/structure-> those questions as question groups
//   4. POST /api/figure                       -> for any set answered against a
//                                                map, plan or diagram, that picture
//                                                cut out of its printed page
//
// Steps 1-3 are the walk every skill shares (shared.ts). Step 4 is listening's
// own in practice, since Part 2 nearly always prints a map, and it is best-effort:
// a part whose picture couldn't be found still keeps all of its questions.

import type { Listening, Part } from "@/lib/pdf";
import { attachFigures } from "./figures";
import { readQuestions, type QuestionRoutes, type RenderPage } from "./shared";

const ROUTES: QuestionRoutes = {
  questions: "/api/listening/questions",
  page: "/api/listening/questions/page",
  structure: "/api/listening/questions/structure",
};

export async function analyzeListeningPart(
  part: Part,
  image: RenderPage,
): Promise<Listening> {
  const read = await readQuestions(part, ROUTES, image);
  if (!read.groups) return read;
  return { ...read, groups: await attachFigures(part, read.groups, image) };
}
