"use client";

// Reading one skill's answer key.
//
// Unlike the passages and questions, this needs no walk and no page images: the
// key is one page of text, split off the end of the skill before any part was
// looked at (lib/pdf/answers.ts), and one call turns it into the answers
// themselves —
//
//   POST /api/answers  ->  one entry per numbered box, with every form the book
//                          allows written out, ready to mark a sheet against
//
// Best-effort, like the figures: a skill whose key couldn't be read still has
// every question in it, and still shows the key as the page prints it. It just
// can't mark itself.

import type { AnswerKey } from "@/lib/questions";
import type { QuestionSkill } from "@/lib/claude/shared";
import { post } from "./shared";

export async function readAnswerKey(
  text: string,
  skill: QuestionSkill,
): Promise<AnswerKey> {
  const { key } = await post<{ key: AnswerKey }>("/api/answers", {
    text,
    skill,
  });
  return key;
}
