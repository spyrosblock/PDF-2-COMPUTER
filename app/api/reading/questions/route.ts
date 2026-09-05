// Step 2 of reading extraction: the questions — but only if the extracted text is
// good enough to read them from.
//
// POST { text }  ->  { status: "ok", questions }
//                 |  { status: "need-pages", pages: [12, 13] }
//
// When the model asks for pages the caller switches to the page-at-a-time route
// (app/api/reading/questions/page), because rendering those page images needs the
// PDF, which lives in the browser. See lib/claude/steps.ts for the step itself.

import { READING_PROMPTS } from "@/lib/claude/reading";
import { badRequest, jsonBody, requiredString, upstreamFailure } from "@/lib/claude/request";
import { checkAndExtractQuestions } from "@/lib/claude/steps";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return badRequest("Expected a JSON body.");
  const text = requiredString(body, "text");
  if (!text) return badRequest("`text` is required.");

  try {
    return Response.json(await checkAndExtractQuestions(text, READING_PROMPTS));
  } catch (err) {
    return upstreamFailure(err, "reading questions extraction");
  }
}
