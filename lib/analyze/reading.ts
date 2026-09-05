"use client";

// Turning one reading part into a passage and a set of questions.
//
// lib/pdf gets a reading part down to one run of formatted text — passage and
// questions together, still carrying page banners and the odd running header.
// Telling the two apart, and keeping a question set intact through the layout
// damage a text layer does to tables and diagrams, is a judgement call, so it goes
// to the Claude API through our own routes:
//
//   1. POST /api/reading/passage            -> the passage text
//   2. POST /api/reading/questions          -> either the questions, or a list of
//                                              pages the model wants to see itself
//   3. POST /api/reading/questions/page     -> when it asked: the part's pages one
//                                              at a time, with the requested ones
//                                              rendered from the PDF as images
//   4. POST /api/reading/questions/structure-> those questions as question groups,
//                                              so the page can lay them out the way
//                                              the book prints them
//   5. POST /api/figure                     -> for a set built on a labelled
//                                              diagram, that diagram cut out of its
//                                              printed page
//
// Steps 2-4 are the walk every skill shares (shared.ts). Step 1 is reading's own;
// step 5 it shares with listening, where a Part 2 map makes it the common case —
// here it costs nothing at all unless a set is answered on a picture.

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
  const { passage } = await post<{ passage: string }>("/api/reading/passage", {
    text: part.text,
  });
  const read = await readQuestions(part, ROUTES, image);
  if (!read.groups) return { passage, ...read };
  return {
    passage,
    ...read,
    groups: await attachFigures(part, read.groups, image),
  };
}
