// Locating the picture a question set is answered against.
//
// POST { page, image, heading?, instructions? }
//   ->  { found: false }
//    |  { found: true, box: { left, top, right, bottom } | null, alt }
//
// `image` is the whole printed page, rendered from the PDF in the browser. The
// model finds the map, plan or diagram on it and gives back the rectangle it
// occupies, as fractions of the page, which the caller crops to. A `box` of null
// means it saw the picture but described it with a rectangle we couldn't use —
// the caller then shows the whole page (lib/claude/figures.ts).
//
// Skill-neutral: listening's Part 2 maps are what it was written for, but a
// reading passage's labelled diagram is the same problem.

import { askClaude, dataUrlToAttachment, parseJsonObject } from "@/lib/claude/client";
import { figurePrompt, parseFigure } from "@/lib/claude/figures";
import {
  badRequest,
  jsonBody,
  optionalString,
  stringList,
  upstreamFailure,
} from "@/lib/claude/request";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return badRequest("Expected a JSON body.");

  const page = Number(body.page);
  if (!Number.isInteger(page) || page <= 0) {
    return badRequest("`page` must be a positive page number.");
  }
  const image = optionalString(body, "image");
  if (!image) return badRequest("`image` is required.");

  try {
    const attachment = dataUrlToAttachment(image, `page-${page}.jpg`);
    const reply = await askClaude(
      figurePrompt(
        page,
        optionalString(body, "heading") ?? "",
        stringList(body, "instructions"),
      ),
      [attachment],
    );
    const parsed = parseJsonObject<{
      found?: unknown;
      box?: unknown;
      alt?: unknown;
    }>(reply);
    const figure = parsed ? parseFigure(parsed) : null;

    return Response.json(
      figure ? { found: true, box: figure.box, alt: figure.alt } : { found: false },
    );
  } catch (err) {
    return upstreamFailure(err, `finding the figure on page ${page}`);
  }
}
