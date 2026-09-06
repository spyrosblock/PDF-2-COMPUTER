// Cutting a part's questions into the sets the book prints them in. One call
// per set: structuring a whole part in one go needs a JSON reply long enough
// that the upstream gateway times out. The cut is a text heuristic — a set
// begins at a line that is a group heading and nothing else.

// "Questions 14-18" / "Questions 23 and 24" / "Question 40" on a line of its
// own, give or take a short tail.
const HEADING =
  /^questions?\s+\d{1,2}\s*(?:[-–—]\s*\d{1,2}|and\s+\d{1,2})?\b.{0,20}$/i;

export function isSetHeading(line: string): boolean {
  return HEADING.test(line.trim());
}

// Split the questions text at its group headings. Text above the first heading
// stays with the first set; text with no heading at all comes back as one piece.
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
