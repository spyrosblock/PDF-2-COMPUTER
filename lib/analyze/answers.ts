"use client";

// Reading one skill's answer key via POST /api/answers: one entry per numbered
// box, with every accepted form written out. The key was split off the skill's
// end earlier (lib/pdf/answers.ts), so no walk or images are needed. Best-effort:
// a skill whose key can't be read still shows it as printed — it just can't
// mark itself.

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
