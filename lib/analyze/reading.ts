"use client";

// Turning one reading part into a passage and a set of questions. Passage and
// questions are a judgement call, so they go to the Claude API via our routes:
// /api/reading/passage, /api/reading/questions (+ /page for the pages the model
// wants as images, + /structure for groups), and /api/figure for a labelled
// diagram (shared with listening). Steps 2-4 are the shared walk (shared.ts).

import type { Part, Reading } from "@/lib/pdf";
import { attachFigures } from "./figures";
import { post, readQuestions, type QuestionRoutes, type RenderPage } from "./shared";

const ROUTES: QuestionRoutes = {
  questions: "/api/reading/questions",
  page: "/api/reading/questions/page",
  structure: "/api/reading/questions/structure",
};

export async function analyzeReadingPart(
  part: Part,
  image: RenderPage,
): Promise<Reading> {
  // Passage and questions are independent reads — go up side by side.
  const [{ passage }, read] = await Promise.all([
    post<{ passage: string }>("/api/reading/passage", { text: part.text }),
    readQuestions(part, ROUTES, image),
  ]);
  if (!read.groups) return { passage, ...read };
  return {
    passage,
    ...read,
    groups: await attachFigures(part, read.groups, image),
  };
}
