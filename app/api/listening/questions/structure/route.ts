// Step 2 of listening extraction: the questions as structure rather than as text.
//
// POST { questions }  ->  { groups }
//
// The same step reading uses (lib/claude/steps.ts), told which skill it is
// describing: a listening set is never True/False/Not Given and never a list of
// headings, and its commonest form by far — a form, a table or a block of notes
// with numbered gaps — is one the model has to lay out as a body rather than as a
// list of questions.

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
    const groups = await structureQuestions(questions, "Listening");
    if (groups.length === 0) {
      return Response.json(
        { error: "None of the question sets could be structured." },
        { status: 502 },
      );
    }
    return Response.json({ groups });
  } catch (err) {
    return upstreamFailure(err, "structuring the listening questions");
  }
}
