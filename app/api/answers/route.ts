// The skill's printed answer key, read into the answers themselves.
//
// POST { text, skill }  ->  { key }
//
// `text` is the answer-key page lib/pdf/answers.ts split off the end of a
// Listening or Reading skill, `skill` which of the two it belongs to. What comes
// back is one entry per numbered box with every form the book allows written out,
// so a student's sheet can be marked against it (lib/questions/key.ts). The
// prompt is lib/claude/answers.ts; the step, including how a key that comes back
// with holes in its numbering is retried, is lib/claude/steps.ts.
//
// One route for both skills — unlike the question extraction, whose prompts
// differ per skill, a key is a key: the skill is passed on only so the reply can
// be told which test it is reading.

import {
  badRequest,
  jsonBody,
  requiredString,
  upstreamFailure,
} from "@/lib/claude/request";
import { extractAnswerKey } from "@/lib/claude/steps";
import type { QuestionSkill } from "@/lib/claude/shared";

const SKILLS: QuestionSkill[] = ["Reading", "Listening"];

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return badRequest("Expected a JSON body.");
  const text = requiredString(body, "text");
  if (!text) return badRequest("`text` is required.");
  const skill = SKILLS.find((s) => s === requiredString(body, "skill"));
  if (!skill) return badRequest("`skill` must be Reading or Listening.");

  try {
    const key = await extractAnswerKey(text, skill);
    if (key.length === 0) {
      return Response.json(
        { error: "No answers could be read out of the key." },
        { status: 502 },
      );
    }
    return Response.json({ key });
  } catch (err) {
    return upstreamFailure(err, `reading the ${skill} answer key`);
  }
}
