# PdfToComputer — P2C

# Goal

Help students prepare for the IELTS Academic exam by simulating the new
computer-delivered test format, using the practice book they already own.

A student has bought an official Cambridge *IELTS Academic authentic practice
tests* book as a PDF. They upload it; the app digitises the tests inside it so
they can answer in the same on-screen format used at the exam centre, and marks
the paper against the book's own answer key.

This file is the intent: what the product is for, what the exam format demands,
and what is deliberately left out. How the app actually turns a PDF into a test
— extraction, analysis, storage, the page structure — is in
[README.md](README.md), which is the description of record. Don't restate it
here; two descriptions of one pipeline is how this file went stale before.

# Scope

A book holds 4 tests. Each test offers three skills:

- **Listening** — 4 parts, 10 questions each.
- **Reading** — 3 passages, 13 / 13 / 14 questions.
- **Writing** — 2 tasks; Task 1 is the printed chart, Task 2 the essay prompt.

Speaking is extracted from the book but not offered as a sittable skill: it is
an examiner interview, with nothing for a student to do alone on screen.

Listening is sat without audio. The books ship the recordings separately, and
the printed audio scripts are dropped during splitting rather than shown — a
script beside the questions would give the answers away. The questions are
therefore practice in the format, not a timed listening test.

# The test experience

## Exam-like layout

The computer-delivered test splits the screen; so do we.

- **Reading**: passage on the left, that part's questions on the right, each
  side scrolling independently.
- **Writing**: the task (chart image or prompt) on the left, the essay typed on
  the right, with a live word count against the task's minimum (150 / 250).
- **Listening**: questions alone, with the map, plan or diagram a set is
  answered against shown beside it.

Question groups carry their printed heading ("Questions 14-20") and the
instruction lines under it verbatim — word limits, "Choose TWO letters", the
list of headings — because those instructions are part of what is being tested.

## Parts and navigation

A skill's parts are tabs. Switching parts keeps the timer running and preserves
everything already answered; a student can move back and forth freely until
they submit.

## Timing

A stopwatch per skill, counting up from zero, started and stopped by the
student and surviving a reload. Advisory only: nothing auto-submits and nothing
locks.

This is deliberately *not* the exam's countdown. The book gives no invigilator
and no fixed sitting; a student practising at their desk is better served by
seeing how long a part actually took them than by being cut off.

## Marking

On submit, the sheet is compared against the answer key printed in the book.

- Reported as a raw score (e.g. 32/40) over the boxes the key actually covers,
  with a line per wrong answer showing what the student wrote beside what the
  book prints.
- Where the key lists several acceptable forms for one answer ("aircraft /
  plane"), every form is captured and any of them counts.
- Where the key marks a set as unordered ("23 & 24 IN EITHER ORDER"), either
  number may hold either answer, each counting once.
- Only case, punctuation and hyphen-vs-space are forgiven. IELTS marks
  spelling, so no stemming and no synonyms — anything else the book allows must
  be written out as an accepted form.
- Writing is not marked. There is no key to mark it against; the student writes
  the essay and keeps it.

# Types of reading questions

There are 11 official IELTS Academic Reading question types. A single reading
passage typically contains 2-3 of them, grouped into sets with shared
instructions (e.g. "Questions 14-18"). This list is the reference the
extraction prompts and the stored question model are built on — see
`QUESTION_TYPES` in `lib/questions/types.ts`.

1. **Multiple Choice** — Choose one correct answer from 4 options (A-D), or
   choose 2+ correct answers from a longer list. UI: radio buttons (single
   answer) or checkboxes (multiple answers).
2. **Identifying Information (True / False / Not Given)** — Decide whether a
   statement agrees with, contradicts, or is not addressed by the text. UI:
   3-way radio button / select per statement.
3. **Identifying Writer's Views/Claims (Yes / No / Not Given)** — Same mechanic
   as #2, but judges the statement against the writer's opinions/claims rather
   than facts. UI: identical to True/False/Not Given.
4. **Matching Information** — Find which lettered paragraph/section contains a
   specific piece of information. UI: dropdown of paragraph letters per
   question.
5. **Matching Headings** — Match a list of headings (given as Roman numerals,
   more headings than paragraphs) to each paragraph. UI: dropdown per paragraph.
6. **Matching Features** — Match statements to a list of lettered options (e.g.
   people, theories, dates); options may be reused. UI: dropdown per statement.
7. **Matching Sentence Endings** — Match a sentence beginning to the correct
   ending from a list (more endings than beginnings). UI: dropdown per sentence
   beginning.
8. **Sentence Completion** — Fill a gap in a sentence using words taken
   directly from the text, under a strict word limit (e.g. "NO MORE THAN TWO
   WORDS"). UI: free-text input per gap.
9. **Summary / Note / Table / Flow-Chart Completion** — Fill gaps in a
   summary/notes/table/flow-chart, either with words from the text (free-text
   input) or by choosing from a word bank (dropdown) — the source text
   specifies which. One type, not four: they differ only in how the gapped text
   is laid out.
10. **Diagram Label Completion** — Label parts of a diagram using words from
    the text, under a word limit. UI: free-text input per label.
11. **Short-Answer Questions** — Answer a question with words taken from the
    text, under a word limit. UI: free-text input per question.

Listening draws on six of these — multiple choice, matching features, sentence
completion, summary/note/table/form completion (its commonest set by far),
diagram labelling, and short answer. The other five judge a statement against a
printed passage and do not occur there.

# Not built yet

Wanted, specified, not implemented. Nothing below describes current behaviour.

- **Analysis on demand** — a book is digitised skill by skill, as the student
  opens each, rather than in one pass at upload. The upload wait is the app's
  worst moment, and most of it buys parts nobody opens. The cost is a shorter
  wait on first opening a skill, which is the better place to pay it: it is
  work the student asked for. See README for what it means for the pipeline.
- **Highlighting** — selecting text in the passage and highlighting it (and
  clearing highlights), the way the real test allows. A study aid, never graded.
- **Downloadable report** — a PDF of the marked paper to keep or hand to a
  teacher. Results are currently shown in the page only.
- **Word-limit enforcement** — an answer over the stated limit ("NO MORE THAN
  TWO WORDS") is wrong regardless of its content. Marking does not check length
  today.
- **"Used once only" option lists** — where a set says an option is used once,
  choosing it should remove or disable it in the other dropdowns of that set.
- **Diagram Label Completion as a real layout** — needs the diagram image plus
  the position of each label pointer, so inputs can sit against the picture.
  Today the figure is shown and the labels are answered as an ordinary list.

# Out of scope

- **Band scores.** Only a raw score is reported. The raw-to-band conversion
  varies per test administration and isn't fixed in the book.
- **Speaking.** See Scope.
- **Audio.** The books' recordings aren't in the PDF; see Scope.
- **Essay marking.** No key exists for it in the book.
