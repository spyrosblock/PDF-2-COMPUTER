// The extraction steps, as the routes under app/api run them.
//
// Reading and listening are digitised by the same three steps — check the text,
// read the questions out of it (whole, or a page at a time with the page images),
// then describe those questions as structure — and only the prompts differ. The
// routes are therefore thin: they check their request body and call in here with
// their skill's prompts, so there is one implementation of each step rather than
// one per skill.
//
// Everything here runs on the server: it reaches the Claude API through
// lib/claude/client.ts, which holds the key.

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

// Step 1. Ask first whether the extracted text is clear enough to read the
// questions from; only when it says yes do we spend a second call reading them.
// When it asks for pages the caller switches to extractPageQuestions, because
// rendering those page images needs the PDF, which lives in the browser.
//
// A reply we can't parse is treated as "ok": the check is a quality gate, not the
// extraction itself, and falling back to the text costs less than failing the
// part outright.
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

  // The model has just called this text clear enough to read the questions from,
  // so an empty answer contradicts itself — ask again before believing it.
  const questions = await askClaudeForText(prompts.extract(text), [], true);
  return { status: "ok", questions };
}

// Step 2. The questions on ONE printed page. `image` is a
// "data:image/jpeg;base64,..." URL rendered from the PDF in the browser, attached
// for the pages the model asked to see; the others go as text alone. Returns ""
// when nothing on the page is a question.
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
  // A page that carries no questions is a real answer for reading (most pages of
  // a part are all passage) and a rare one for listening, so NONE is taken at
  // face value. It isn't when the page's text plainly carries questions, or when
  // this is a page the model asked to see for itself — there, an empty answer is
  // a slip, so it gets one more go.
  const mustHaveQuestions = image !== null || looksLikeQuestions(text);
  return askClaudeForText(
    prompts.page(page, text, attachments.length > 0),
    attachments,
    mustHaveQuestions,
  );
}

// How many goes one question set gets at being structured. All three ways it
// fails are worth a second try and none are worth failing the part over: the
// upstream times out (these replies run close to its limit), the reply can't be
// parsed, or it comes back missing something the printed set plainly has — a
// question number, or the list of options (lib/questions/verify.ts).
const TRIES = 2;

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

// Step 3. The questions as question groups rather than as text.
//
// One call per printed question set, not one per part. The reply is JSON as long
// as the questions it describes, and a whole part's worth takes long enough that
// the upstream gateway times out (see lib/questions/split.ts) — so the text is
// cut at its group headings first and the sets are structured one after another.
// Sequentially, because the parts themselves are already analysed several at a
// time (lib/analyze) and firing every set of every part at once would only invite
// rate limits.
//
// If neither try at a set is complete the fuller of the two is kept; that set is
// then imperfect, the rest of the part isn't.
export async function structureQuestions(
  questions: string,
  skill: QuestionSkill,
): Promise<QuestionGroup[]> {
  const groups: QuestionGroup[] = [];
  for (const set of splitQuestionSets(questions)) {
    groups.push(...(await structureSet(set, skill)));
  }
  return groups;
}

// Step 4. The skill's printed answer key as the answers themselves.
//
// Not part of the walk above: a key belongs to a whole skill rather than to one
// part (the books print one page of answers for all 40 questions), and it is
// split off the skill's text long before any part is analysed — see
// lib/pdf/answers.ts. It is also short, so unlike the questions it goes up in a
// single call.
//
// The same two tries the question sets get, and for the same reasons: the reply
// can fail to parse, and it can come back missing answers the page plainly
// printed. A key with a hole in its numbering is the tell — the books number
// straight through, so a gap is a line the model skipped — and between two
// imperfect readings the one that skipped less is kept.
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
