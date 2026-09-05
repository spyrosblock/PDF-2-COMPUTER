"use client";

// Laying a part's question sets out the way the book prints them, and letting the
// student write in them.
//
// The model in lib/questions names what each line of the extracted text was: a
// heading, an instruction, an option everyone chooses from, a numbered question,
// a cell of a table. This renders that back — a card per set, its instructions
// above it, its shared list boxed the way the book boxes it, its questions
// numbered down a gutter, and each gap drawn as a blank carrying its number.
//
// Every numbered answer is a text field, so a paper can be sat rather than only
// read. A completion gap is a field in the sentence, where the book prints the
// blank. A question answered with a letter, a TRUE / FALSE / NOT GIVEN or a few
// words of its own has no blank printed anywhere — the book expects it on a
// separate answer sheet — so the field goes at the end of the question. Where the
// numbers are printed on a picture instead — the map of a park, the plan of a
// building — the fields go under the picture, numbered, in the order the set
// claims them.
//
// Given an `answers` sheet the blanks become inputs; without one (the upload
// debug view) they stay dashed lines, since there is nowhere to keep what would
// be typed. Answers are held per book/test/skill, not per part: see lib/answers.

import { createContext, Fragment, useContext, useMemo } from "react";
import {
  GAP,
  QUESTION_TYPE_LABELS,
  gapNumbers,
  groupNumbers,
  headingNumbers,
  type Block,
  type Figure,
  type Item,
  type Option,
  type OptionList,
  type QuestionGroup,
  type QuestionType,
} from "@/lib/questions";
import type { AnswerSheet } from "@/lib/answers";

// The sheet being written into, and a name for the part being written in. Gaps
// are keyed by their printed question number wherever there is one; the scope
// only names the unnumbered ones, which have nothing else to be called and would
// otherwise collide between the parts sharing a sheet.
type Answering = { sheet: AnswerSheet; scope: string };

const AnswersContext = createContext<Answering | null>(null);

export function QuestionGroups({
  groups,
  answers,
  scope = "",
}: {
  groups: QuestionGroup[];
  answers?: AnswerSheet;
  scope?: string;
}) {
  const answering = useMemo(
    () => (answers ? { sheet: answers, scope } : null),
    [answers, scope],
  );

  return (
    <AnswersContext.Provider value={answering}>
      <div className="flex flex-col gap-6">
        {groups.map((group, i) => (
          <Group key={i} group={group} path={`g${i}`} />
        ))}
      </div>
    </AnswersContext.Provider>
  );
}

function Group({ group, path }: { group: QuestionGroup; path: string }) {
  const plan = useMemo(() => answerPlan(group), [group]);

  return (
    <FieldWidthContext.Provider value={fieldWidth(group.type)}>
      <article className="flex flex-col gap-4 rounded-lg border border-black/10 bg-black/2 p-5 dark:border-white/10 dark:bg-white/3">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-base font-semibold tracking-tight">
            {group.heading || fallbackHeading(group)}
          </h3>
          <span className="text-xs text-black/50 dark:text-white/50">
            {QUESTION_TYPE_LABELS[group.type]}
          </span>
        </header>

        {group.instructions.length > 0 && (
          <div className="flex flex-col gap-1 text-sm leading-relaxed text-black/70 italic dark:text-white/70">
            {group.instructions.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

        {group.figure && <FigureView figure={group.figure} />}

        {plan.loose.length > 0 && <FigureAnswers numbers={plan.loose} />}

        {group.optionList && (
          <Options list={group.optionList} path={`${path}.l`} />
        )}

        {group.body.length > 0 && (
          <div className="flex flex-col gap-3 text-sm leading-relaxed">
            {group.body.map((block, i) => (
              <BlockView key={i} block={block} path={`${path}.b${i}`} />
            ))}
          </div>
        )}

        {group.items.length > 0 && (
          <ol className="flex flex-col gap-3 text-sm leading-relaxed">
            {group.items.map((item, i) => (
              <ItemView
                key={i}
                item={item}
                path={`${path}.i${i}`}
                inline={plan.inline}
              />
            ))}
          </ol>
        )}
      </article>
    </FieldWidthContext.Provider>
  );
}

// "Questions 14-20", rebuilt from the numbers in the set, for a group whose
// printed heading didn't survive the extraction.
function fallbackHeading(group: QuestionGroup): string {
  const numbers = groupNumbers(group);
  if (numbers.length === 0) return "Questions";
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  return first === last ? `Question ${first}` : `Questions ${first}-${last}`;
}

// How wide an answer field is drawn, by what the set asks to be written in it: a
// letter picked from a list needs room for a letter, TRUE / NOT GIVEN for two
// short words, a completion gap for a phrase. It is a property of the whole set,
// so it rides a context rather than being threaded through every block, cell and
// option a gap can turn up in.
const FieldWidthContext = createContext("w-32");

const FIELD_WIDTHS: Partial<Record<QuestionType, string>> = {
  "multiple-choice": "w-16",
  "matching-information": "w-16",
  "matching-headings": "w-16",
  "matching-features": "w-16",
  "matching-sentence-endings": "w-16",
  "true-false-not-given": "w-28",
  "yes-no-not-given": "w-28",
};

function fieldWidth(type: QuestionType): string {
  return FIELD_WIDTHS[type] ?? "w-32";
}

// The numbered boxes one question fills: its own number, and the one after it for
// each further answer it asks for ("Choose TWO letters" fills two).
function itemNumbers(item: Item): number[] {
  const first = item.n;
  if (first === null) return [];
  return Array.from({ length: Math.max(1, item.select) }, (_, i) => first + i);
}

function hasGap(text: string): boolean {
  for (const _ of text.matchAll(GAP)) return true;
  return false;
}

// Where a set wants each of its answers written.
//
// A gap printed in the text answers itself: the blank is in the sentence, and
// GapText draws a field in it. Every other number wants a field put somewhere for
// it — a letter chosen from a list, a TRUE / FALSE / NOT GIVEN, the answer to a
// short question — because the book prints those on a separate answer sheet and
// so leaves no blank on the page at all.
//
// `inline` is the numbers already answerable in the set's own text, wherever they
// sit in it. A question claiming any other number gets a field of its own (see
// ItemView). What is left — numbers the set claims that none of its questions
// carry — is the picture-labelling case: they are printed on the map or the plan,
// against places the extraction kept as nothing at all, so they go under it in
// number order. Only a set that has a picture is read that way: a set can
// legitimately claim numbers whose questions we simply failed to extract, and
// inventing loose fields for those would be worse than leaving them out.
function answerPlan(group: QuestionGroup): {
  inline: Set<number>;
  loose: number[];
} {
  const inline = new Set(gapNumbers(group));
  if (!group.figure) return { inline, loose: [] };

  const wanted = new Set([
    ...groupNumbers(group),
    ...headingNumbers(group.heading),
  ]);
  for (const n of inline) wanted.delete(n);
  for (const item of group.items) {
    for (const n of itemNumbers(item)) wanted.delete(n);
  }

  return { inline, loose: [...wanted].sort((a, b) => a - b) };
}

// The map, plan or diagram the set is answered against, printed where the book
// prints it: under the instructions, above the questions. It is a photograph of
// the page, so it keeps a white ground in dark mode too — inverting it would make
// a nonsense of a map drawn in black on white. When the picture couldn't be cut
// out of its page the whole page stands in, and the caption says so, since the
// student is then looking at instructions and page numbers as well.
function FigureView({ figure }: { figure: Figure }) {
  return (
    <figure className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={figure.image}
        alt={figure.alt || `The picture these questions are answered against, from printed page ${figure.page}.`}
        className="w-full rounded-md border border-black/15 bg-white dark:border-white/20"
      />
      {!figure.cropped && (
        <figcaption className="text-xs text-black/50 dark:text-white/50">
          Printed page {figure.page}, shown whole.
        </figcaption>
      )}
    </figure>
  );
}

// The fields for labels printed on the picture rather than in the text, laid out
// under it in number order. Nothing is written beside them but their number:
// what each one is is drawn on the picture above.
function FigureAnswers({ numbers }: { numbers: number[] }) {
  const answering = useContext(AnswersContext);
  if (!answering) return null;
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-3">
      {numbers.map((n) => (
        <li key={n}>
          <AnswerInput id={String(n)} n={String(n)} />
        </li>
      ))}
    </ol>
  );
}

// The list the whole set draws on — headings, features, sentence endings, a word
// bank. Boxed, as the book boxes it, with the printed letter or numeral kept in
// its own column so the options line up.
function Options({ list, path }: { list: OptionList; path: string }) {
  return (
    <div className="rounded-md border border-black/15 px-4 py-3 dark:border-white/20">
      {list.title && (
        <p className="mb-2 text-sm font-semibold tracking-tight">{list.title}</p>
      )}
      <ul className="flex flex-col gap-1 text-sm leading-relaxed">
        {list.options.map((option, i) => (
          <OptionRow key={i} option={option} path={`${path}o${i}`} />
        ))}
      </ul>
    </div>
  );
}

function OptionRow({ option, path }: { option: Option; path: string }) {
  return (
    <li className="flex gap-2">
      {option.key && (
        <span className="w-8 shrink-0 font-medium tabular-nums">
          {option.key}
        </span>
      )}
      <span className="flex-1">
        <GapText text={option.text} path={path} />
      </span>
    </li>
  );
}

function BlockView({ block, path }: { block: Block; path: string }) {
  if (block.kind === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.cells.map((cell, c) => {
                  const Cell = row.header ? "th" : "td";
                  return (
                    <Cell
                      key={c}
                      className={
                        "border border-black/15 px-3 py-2 align-top dark:border-white/20 " +
                        (row.header ? "font-semibold" : "font-normal")
                      }
                    >
                      <GapText text={cell} path={`${path}.r${r}c${c}`} />
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.kind === "heading") {
    return (
      <p className="font-semibold tracking-tight">
        <GapText text={block.text} path={path} />
      </p>
    );
  }

  if (block.kind === "bullet") {
    return (
      <p className="flex gap-2 pl-1">
        <span aria-hidden className="text-black/40 dark:text-white/40">
          •
        </span>
        <span className="flex-1">
          <GapText text={block.text} path={path} />
        </span>
      </p>
    );
  }

  return (
    <p>
      <GapText text={block.text} path={path} />
    </p>
  );
}

// One numbered question: its number down the gutter, then the question itself and
// — for ordinary multiple choice, where the options belong to this question
// alone — its own lettered options under it. A question that takes two answers
// covers two numbered boxes and is labelled with both ("23-24"), the way the book
// heads it "Questions 23 and 24".
//
// Then the field to answer it in. A completion question already has one, printed
// as a gap in its own sentence; anything else — a letter, a TRUE / FALSE / NOT
// GIVEN, a few words of answer, a label belonging to a map — is answered at the
// end of the question, after the options where it has any, since the student
// reads those before writing. The number is repeated against each field only
// where a question takes more than one, so that it is clear which is which; a
// single field is already named by the number down the gutter.
function ItemView({
  item,
  path,
  inline,
}: {
  item: Item;
  path: string;
  inline: Set<number>;
}) {
  const numbers = itemNumbers(item);
  const label =
    numbers.length === 0
      ? ""
      : numbers.length > 1
        ? `${numbers[0]}-${numbers[numbers.length - 1]}`
        : String(numbers[0]);

  // A gap in the question's own text is where it is answered, even when the gap
  // came through unnumbered and so isn't in `inline`.
  const fields = hasGap(item.text)
    ? []
    : numbers.filter((n) => !inline.has(n));

  const answers = fields.map((n) => (
    <AnswerInput
      key={n}
      id={String(n)}
      n={String(n)}
      prefix={fields.length > 1}
    />
  ));

  return (
    <li className="flex gap-3">
      <span className="min-w-6 shrink-0 pt-px font-semibold whitespace-nowrap tabular-nums">
        {label}
      </span>
      <div className="flex flex-1 flex-col gap-2">
        <span>
          <GapText text={item.text} path={path} />
          {item.options.length === 0 && answers}
        </span>
        {item.options.length > 0 && (
          <>
            <ul className="flex flex-col gap-1">
              {item.options.map((option, i) => (
                <OptionRow key={i} option={option} path={`${path}o${i}`} />
              ))}
            </ul>
            {answers.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2">{answers}</div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

// Text with its gaps drawn as blanks. A gap keeps the number printed against it,
// because that is how a student says which answer is which. `path` says where in
// the set this run of text sits, so that a gap the book left unnumbered still has
// a name to be stored under.
function GapText({ text, path }: { text: string; path: string }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  let nth = 0;

  for (const match of text.matchAll(GAP)) {
    const start = match.index ?? 0;
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<Gap key={start} n={match[1]} path={path} nth={nth++} />);
    at = start + match[0].length;
  }
  if (at === 0) return <>{text}</>;
  if (at < text.length) parts.push(text.slice(at));

  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}

function Gap({ n, path, nth }: { n: string; path: string; nth: number }) {
  const answering = useContext(AnswersContext);
  const id = n || `${answering?.scope ?? ""}|${path}#${nth}`;
  return <AnswerInput id={id} n={n} />;
}

// A blank, with the question number printed small against it as the book prints
// it. It is a field to type in when there is a sheet to keep the answer on, and a
// dashed rule when there isn't. `prefix` is false where the number is already
// printed beside the blank — down a question's gutter — so it isn't said twice;
// the field is still named by it for a screen reader. How wide it is drawn is the
// set's business, not the field's: see FieldWidthContext.
function AnswerInput({
  id,
  n,
  prefix = true,
}: {
  id: string;
  n: string;
  prefix?: boolean;
}) {
  const answering = useContext(AnswersContext);
  const width = useContext(FieldWidthContext);
  const shown = prefix ? n : "";

  if (!answering) {
    return (
      <span className="mx-1 inline-flex items-baseline gap-1 align-baseline">
        {shown && <GapNumber n={shown} />}
        <span
          aria-hidden
          className={`inline-block border-b border-dashed border-black/40 dark:border-white/40 ${width}`}
        />
        <span className="sr-only">blank</span>
      </span>
    );
  }

  const { sheet } = answering;
  const value = sheet.get(id);

  return (
    <span className="mx-1 inline-flex items-baseline gap-1 align-baseline">
      {shown && <GapNumber n={shown} />}
      <input
        type="text"
        value={value}
        onChange={(e) => sheet.set(id, e.target.value)}
        aria-label={n ? `Answer for question ${n}` : "Answer"}
        // It is a spelling test as much as a listening one: no autocorrect, no
        // suggestions, no red underline offering the word back.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={
          `inline-block ${width} max-w-full border-b bg-transparent px-1 text-sm outline-none transition-colors focus:border-solid focus:border-blue-600 dark:focus:border-blue-400 ` +
          (value
            ? "border-solid border-black/60 dark:border-white/60"
            : "border-dashed border-black/40 dark:border-white/40")
        }
      />
    </span>
  );
}

function GapNumber({ n }: { n: string }) {
  return (
    <span className="text-xs font-semibold tabular-nums text-black/60 dark:text-white/60">
      {n}
    </span>
  );
}
