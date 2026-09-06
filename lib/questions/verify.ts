// Checking a structured set against the text it came from: is there anything to
// answer at all, do the numbers the heading claims all appear, and does the
// printed option list come back? All three fail silently — a tidy question with
// nothing to choose from, or a summary whose gaps were written back as prose. A
// coverage check, not a proof: it can't catch rewording, only plainly missing
// content.

import { groupNumbers, headingNumbers, type QuestionGroup } from "./types";
import { isSetHeading } from "./split";

// The numbers the source's heading claims (a chunk holds one set).
function sourceNumbers(set: string): number[] {
  const line = set.split(/\r?\n/).find(isSetHeading);
  return line ? headingNumbers(line) : [];
}

// The option letters the set prints: a letter/Roman numeral at the head of a
// line, set off by tab, two-plus spaces or punctuation. A single space is not
// enough — "A greater supply of ..." is not option A.
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
  // Not one numbered question and not one gap: whatever came back, there is
  // nothing in it a student can answer.
  if (covered.size === 0) return { complete: false, score: 0 };

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
