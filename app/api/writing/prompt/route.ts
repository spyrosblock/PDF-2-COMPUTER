// The one step of writing extraction: the task description.
//
// POST { text }  ->  { prompt }
//
// `text` is one Writing Task 2 part as lib/pdf formatted it — the task
// description plus the heading, page banners and stray fragments around it.
// `prompt` is the description on its own, "" when the model could find none.

import { askClaudeForText } from "@/lib/claude/client";
import { taskPromptPrompt } from "@/lib/claude/writing";
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
    // A Task 2 part always has a task description, so an empty answer is the
    // model slipping rather than a finding — ask once more before believing it.
    const prompt = await askClaudeForText(taskPromptPrompt(text), [], true);
    return Response.json({ prompt });
  } catch (err) {
    return upstreamFailure(err, "writing task extraction");
  }
}