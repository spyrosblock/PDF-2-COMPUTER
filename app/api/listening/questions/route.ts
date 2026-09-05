// Step 1 of listening extraction: the part's questions — but only if the
// extracted text is good enough to read them from.
//
// POST { text }  ->  { status: "ok", questions }
//                 |  { status: "need-pages", pages: [12, 13] }
//
// The same two-call shape as reading's, under listening's own prompts
// (lib/claude/listening.ts): a listening page is all questions, and what it
// prints — forms, tables, option lists, a map — survives the text layer far worse
// than prose does, so this check asks for page images more often than reading's.
// When it does, the caller switches to the page-at-a-time route, because
// rendering those page images needs the PDF, which lives in the browser.

import { LISTENING_PROMPTS } from "@/lib/claude/listening";
import {
  badRequest,
  jsonBody,
  requiredString,
  upstreamFailure,
} from "@/lib/claude/request";
import { checkAndExtractQuestions } from "@/lib/claude/steps";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return badRequest("Expected a JSON body.");
  const text = requiredString(body, "text");
  if (!text) return badRequest("`text` is required.");

  try {
    return Response.json(
      await checkAndExtractQuestions(text, LISTENING_PROMPTS),
    );
  } catch (err) {
    return upstreamFailure(err, "listening questions extraction");
  }
}
