"use client";

// Turning one listening part into a set of questions. No passage exists — the
// whole part is questions, read back off a page the text layer mangles badly.
// Uses the shared walk (/api/listening/questions, + /page, + /structure; see
// shared.ts) plus /api/figure for any map-answered set — best-effort: a part
// whose picture can't be found still keeps all of its questions.

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
