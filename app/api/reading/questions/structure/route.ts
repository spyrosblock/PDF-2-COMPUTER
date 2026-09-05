// Step 3 of reading extraction: the questions as structure rather than as text.
//
// POST { questions }  ->  { groups }
//
// `questions` is what step 2 returned — the part's questions copied out of the
// book word for word, but flat. Here the model names the structure that was
// printed around those words: the groups, their type, their instructions, the
// list they share, and where each gap falls (lib/claude/questions.ts). The step
// itself, including how a set that comes back incomplete is retried, is in
// lib/claude/steps.ts.

import {
  badRequest,
  jsonBody,
  requiredString,
  upstreamFailure,
} from "@/lib/claude/request";
import { structureQuestions } from "@/lib/claude/steps";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return badRequest("Expected a JSON body.");
  const questions = requiredString(body, "questions");
  if (!questions) return badRequest("`questions` is required.");

  try {
    const groups = await structureQuestions(questions, "Reading");
    if (groups.length === 0) {
      return Response.json(
        { error: "None of the question sets could be structured." },
        { status: 502 },
      );
    }
    return Response.json({ groups });
  } catch (err) {
    return upstreamFailure(err, "structuring the reading questions");
  }
}
