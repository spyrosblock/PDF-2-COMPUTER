// Step 1 of reading extraction: the passage text.
//
// POST { text }  ->  { passage }
//
// `text` is one reading part as lib/pdf formatted it (passage + questions in one
// run). `passage` is "" when the part carried no passage the model could find.
// Listening has no counterpart to this step — nothing of the recording is printed.

import { askClaudeForText } from "@/lib/claude/client";
import { passagePrompt } from "@/lib/claude/reading";
import {
  badRequest,
  jsonBody,
  requiredString,
  upstreamFailure,
} from "@/lib/claude/request";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return badRequest("Expected a JSON body.");
  const text = requiredString(body, "text");
  if (!text) return badRequest("`text` is required.");

  try {
    // A reading part always has a passage, so an empty answer is the model
    // slipping rather than a finding — ask once more before believing it.
    const passage = await askClaudeForText(passagePrompt(text), [], true);
    return Response.json({ passage });
  } catch (err) {
    return upstreamFailure(err, "passage extraction");
  }
}
