// Cutting a part's questions into the sets the book prints them in.
//
// Structuring a whole part in one call asks the model for a very long JSON reply,
// and long replies are where this pipeline breaks: a reading part's questions run
// to a few thousand characters, and the reply describing them takes long enough
// that the upstream gateway gives up (a 1.6 KB set answered in ~40s; a 4 KB part
// timed out). One call per printed set keeps every reply short, and costs a
// failure only its own set rather than the part's whole question list.
//
// The cut is a text heuristic over the extracted questions, in the spirit of
// parts.ts: a set begins at a line that is a group heading and nothing else.

// "Questions 14-18", "Questions 23 and 24", "Question 40" — on a line of its own,
// give or take a short tail (some books print "Questions 14-18" beside a hint).
const HEADING =
  /^questions?\s+\d{1,2}\s*(?:[-–—]\s*\d{1,2}|and\s+\d{1,2})?\b.{0,20}$/i;

export function isSetHeading(line: string): boolean {
  return HEADING.test(line.trim());
}

// Split the questions text at its group headings, keeping each heading with the
// set it introduces. Anything printed above the first heading stays with the
// first set, and text with no heading at all comes back as one piece — the
// caller then structures it whole, exactly as before.
export function splitQuestionSets(questions: string): string[] {
  const lines = questions.split(/\r?\n/);
  const starts = lines.flatMap((line, i) => (isSetHeading(line) ? [i] : []));
  if (starts.length <= 1) {
    const only = questions.trim();
    return only ? [only] : [];
  }

  // The first set starts at the top of the text, not at its heading, so a stray
  // instruction line printed above it isn't lost.
  const cuts = [0, ...starts.slice(1)];
  return cuts
    .map((from, i) =>
      lines
        .slice(from, i + 1 < cuts.length ? cuts[i + 1] : lines.length)
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}
