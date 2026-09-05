// Public API for the question model. Import from "@/lib/questions".

export { parseGroups } from "./parse";
export { keyGaps, markSheet, normalizeAnswer, parseAnswerKey } from "./key";
export { splitQuestionSets } from "./split";
export { setCoverage } from "./verify";
export {
  GAP,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  gapNumbers,
  groupNumbers,
  headingNumbers,
  needsFigure,
} from "./types";
export type { AnswerKey, KeyAnswer, Mark, Marking } from "./key";
export type {
  Block,
  Figure,
  Item,
  Option,
  OptionList,
  QuestionGroup,
  QuestionType,
  TableRow,
} from "./types";
