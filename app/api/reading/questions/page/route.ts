// Step 2b of reading extraction: the questions on ONE printed page.
//
// POST { page, text, image? }  ->  { questions }
//
// Used when the check in ../route.ts came back asking for pages. The caller walks
// the part's pages in order and posts them one at a time: `image` (a
// "data:image/jpeg;base64,..." URL rendered from the PDF in the browser) is
// attached for the pages the model asked to see, and the others go as text alone.
// `questions` is "" when nothing on the page is a question.

import { READING_PROMPTS } from "@/lib/claude/reading";
import {
  badRequest,
  jsonBody,
  optionalString,
  upstreamFailure,
} from "@/lib/claude/request";
import { extractPageQuestions } from "@/lib/claude/steps";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return badRequest("Expected a JSON body.");

  const page = Number(body.page);
  if (!Number.isInteger(page) || page <= 0) {
    return badRequest("`page` must be a positive page number.");
  }
  const text = optionalString(body, "text") ?? "";
  const image = optionalString(body, "image");

  try {
    const questions = await extractPageQuestions(
      page,
      text,
      image,
      READING_PROMPTS,
    );
    return Response.json({ questions });
  } catch (err) {
    return upstreamFailure(err, `reading questions extraction for page ${page}`);
  }
}
