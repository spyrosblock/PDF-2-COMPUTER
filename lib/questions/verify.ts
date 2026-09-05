// Checking a structured set against the text it came from.
//
// The model is copying, not composing, so most of what it returns can be checked
// against the source without knowing anything about the passage: the heading says
// which question numbers the set covers, and a set that prints a list of lettered
// options must come back carrying them. Both have been seen to fail — a "Questions
// 25 and 26" set came back correct in every respect except that its five options
// had vanished — and both are silent failures, which is what makes them worth
// catching: a student sees a tidy question with nothing to choose from.
//
// This is a coverage check, not a proof. It cannot tell a reworded question from a
// copied one; it tells the caller whether anything printed is plainly missing, so
// the set can be asked for again (app/api/reading/questions/structure/route.ts).

import { groupNumbers, headingNumbers, type QuestionGroup } from "./types";
import { isSetHeading } from "./split";

// The numbers the source's own heading claims. Only the first heading line is
// read; a chunk holds one set.
function sourceNumbers(set: string): number[] {
  const line = set.split(/\r?\n/).find(isSetHeading);
  return line ? headingNumbers(line) : [];
}

// The option letters the set prints. An option is a letter or Roman numeral
// standing at the head of its line, set off from the option itself — by a tab, by
// two or more spaces, or by punctuation. A single space is deliberately not
// enough: a note beginning "A greater supply of ..." is not an option A.
const OPTION_LINE = /^\(?([A-J]|[ivx]{1,4})\)?(?:[.):]|\t| {2,})\s*\S/i;

function sourceOptionKeys(set: string): Set<string> {
  const keys = new Set<string>();
  for (const line of set.split(/\r?\n/)) {
    const m = OPTION_LINE.exec(line.trim());
    if (m) keys.add(m[1].toUpperCase());
  }
  return keys;
}

// Every option the groups carry, shared list and per-question alike.
function returnedOptionCount(groups: QuestionGroup[]): number {
  return groups.reduce(
    (total, group) =>
      total +
      (group.optionList?.options.length ?? 0) +
      group.items.reduce((n, item) => n + item.options.length, 0),
    0,
  );
}

export type Coverage = {
  complete: boolean; // nothing the source plainly carries is missing
  score: number; // how much of it came back, for picking the better of two tries
};

// Judge one set's groups against the text they were read from.
export function setCoverage(set: string, groups: QuestionGroup[]): Coverage {
  if (groups.length === 0) return { complete: false, score: 0 };

  const covered = new Set(groups.flatMap(groupNumbers));
  const missingNumbers = sourceNumbers(set).filter((n) => !covered.has(n));

  // Two option-looking lines are as likely to be a stray "A." in prose as a list;
  // three make a list, and every real IELTS option list has at least three.
  const wanted = sourceOptionKeys(set).size;
  const returned = returnedOptionCount(groups);
  const missingOptions = wanted >= 3 && returned < wanted;

  return {
    complete: missingNumbers.length === 0 && !missingOptions,
    score: covered.size + returned,
  };
}
