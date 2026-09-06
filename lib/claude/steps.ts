// The extraction steps, as the routes under app/api run them. Reading and
// listening share one implementation; only the prompts differ. Server-only —
// it reaches the Claude API through lib/claude/client.ts, which holds the key.

import { answerKeyPrompt } from "./answers";
import {
  askClaude,
  askClaudeForText,
  dataUrlToAttachment,
  parseJsonObject,
} from "./client";
import { questionsStructurePrompt } from "./questions";
import {
  looksLikeQuestions,
  parseCheck,
  type QuestionPrompts,
  type QuestionSkill,
} from "./shared";
import {
  keyGaps,
  parseAnswerKey,
  parseGroups,
  setCoverage,
  splitQuestionSets,
  type AnswerKey,
  type QuestionGroup,
} from "@/lib/questions";

// Step 1's two possible answers: the questions, or a list of printed pages the
// model wants to see as images before it will read them.
export type QuestionsResult =
  | { status: "ok"; questions: string }
  | { status: "need-pages"; pages: number[] };

// Step 1. Ask whether the text is clear enough before spending a second call
// reading the questions. "need-pages" hands back to the caller (rendering the
// images needs the PDF, which lives in the browser). An unparseable reply is
// treated as "ok" — the check is a quality gate, not the extraction.
export async function checkAndExtractQuestions(
  text: string,
  prompts: QuestionPrompts,
): Promise<QuestionsResult> {
  const raw = await askClaude(prompts.check(text));
  const parsed = parseJsonObject<{
    text_status?: unknown;
    request_page?: unknown;
  }>(raw);
  const check = parsed ? parseCheck(parsed) : null;

  if (check?.status === "need-pages") {
    return { status: "need-pages", pages: check.pages };
  }

  // The model just called this text clear enough, so an empty answer
  // contradicts itself — ask again before believing it.
  const questions = await askClaudeForText(prompts.extract(text), [], true);
  return { status: "ok", questions };
}

// Step 2. The questions on ONE printed page. `image` is a data URL attached
// for pages the model asked to see. Returns "" when nothing on the page is a
// question.
export async function extractPageQuestions(
  page: number,
  text: string,
  image: string | null,
  prompts: QuestionPrompts,
): Promise<string> {
  // With neither the page's text nor its image there is nothing to read.
  if (text.trim() === "" && !image) return "";

  const attachments = image
    ? [dataUrlToAttachment(image, `page-${page}.jpg`)]
    : [];
  // NONE is taken at face value unless the page plainly carries questions or
  // the model asked to see it — there, an empty answer is a slip; retry once.
  const mustHaveQuestions = image !== null || looksLikeQuestions(text);
  return askClaudeForText(
    prompts.page(page, text, attachments.length > 0),
    attachments,
    mustHaveQuestions,
  );
}

// Tries per question set: timeout, unparseable reply, or a missing question
// number / gap / option list all warrant another go, but not failing the part.
// Five, because a set that comes back without the gaps a student types into is
// unusable, and a fresh call usually fixes it where a fresh prompt can't.
const TRIES = 3;

async function structureOnce(
  set: string,
  skill: QuestionSkill,
): Promise<QuestionGroup[]> {
  const reply = await askClaude(questionsStructurePrompt(set, skill));
  const parsed = parseJsonObject<unknown>(reply);
  return parsed ? parseGroups(parsed) : [];
}

async function structureSet(
  set: string,
  skill: QuestionSkill,
): Promise<QuestionGroup[]> {
  let best: QuestionGroup[] = [];
  let bestScore = -1;

  for (let attempt = 0; attempt < TRIES; attempt++) {
    let groups: QuestionGroup[] = [];
    try {
      groups = await structureOnce(set, skill);
    } catch (err) {
      console.error("Structuring a question set failed:", err);
    }
    const { complete, score } = setCoverage(set, groups);
    if (complete) return groups;
    if (score > bestScore) {
      best = groups;
      bestScore = score;
    }
  }

  if (best.length > 0) {
    console.warn(
      `A question set came back incomplete after ${TRIES} tries: ${set.split("\n")[0]}`,
    );
  }
  return best;
}

// Step 3. The questions as structured groups — one call per printed set, cut
// at its group headings first (a whole part's JSON reply would time out; see
// lib/questions/split.ts) and structured side by side. The fullest try is kept
// when none of them is complete.
export async function structureQuestions(
  questions: string,
  skill: QuestionSkill,
): Promise<QuestionGroup[]> {
  const structured = await Promise.all(
    splitQuestionSets(questions).map((set) => structureSet(set, skill)),
  );
  return structured.flat();
}

// Step 4. The skill's printed answer key as the answers themselves. Not part
// of the walk: a key covers a whole skill and is split off early (see
// lib/pdf/answers.ts); it goes up in a single call. Same tries as the question
// sets — a hole in the numbering is the tell of a skipped line, and the reading
// that skipped least is kept.
export async function extractAnswerKey(
  text: string,
  skill: QuestionSkill,
): Promise<AnswerKey> {
  let best: AnswerKey = [];

  for (let attempt = 0; attempt < TRIES; attempt++) {
    let key: AnswerKey = [];
    try {
      const reply = await askClaude(answerKeyPrompt(text, skill));
      key = parseAnswerKey(parseJsonObject<unknown>(reply));
    } catch (err) {
      console.error("Reading an answer key failed:", err);
    }
    const gaps = keyGaps(key);
    if (key.length > 0 && gaps.length === 0) return key;
    if (key.length - gaps.length > best.length - keyGaps(best).length) best = key;
  }

  if (best.length > 0) {
    console.warn(
      `A ${skill} answer key came back missing questions ${keyGaps(best).join(", ")}.`,
    );
  }
  return best;
}
