# PdfToComputer - P2C

# Goal
Help students prepare for the IELTS Academic exam by simulating the new computer-delivered test format (listening, reading, writing).

# Note: this spec is incomplete

# How it works - high level
- Students have already bought an official "IELTS Academic authentic practice tests" book from Cambridge, as a PDF.
- They upload that PDF to this app.
- The app returns a digitised version of the tests in the book, so students can answer questions in the same format used on the actual computer-delivered test at the IELTS exam center.
- After a student completes a test, they can download a PDF report of their reading results.
- Scope: reading only (listening/writing/speaking are out of scope).

# How it works - low level
## Uploading
Student uploads the book PDF, which contains 4 full practice tests plus an answer key section (each test's reading passages, questions, and correct answers).
## Get test data
OCR extracts, per test: the reading passages, the questions (with type, per the list below), and the correct answers from the book's answer key.
## Create tests
From the extracted data, assemble 4 independent digitised tests, each with its reading passages, question sets, and answer key.
## Test structure
Each test consists of 1 reading skill, made up of 3 sections:
- **Section 1**: a text with some paragraphs, followed by 13 questions.
- **Section 2**: a text with some paragraphs, followed by 13 questions.
- **Section 3**: a text with some paragraphs, followed by 14 questions.

Total: 40 questions per test (13 + 13 + 14), matching the official IELTS Academic Reading test.
## User selects test
The student picks which of the 4 tests to take (e.g. Test 2).
## Load reading
The system loads the reading passages and questions for the selected test in the 'ielts like' format (see below).
## Start timer
A 60-minute countdown timer starts. It is advisory only: the test does not auto-submit or lock when it reaches zero, and the student can keep answering.
## Answer questions
The student selects/enters answers per the question type (see "Types of reading questions" below). Answers can be changed until submission.
## Test end
The student ends the test manually (there is no automatic end condition).
## Grading
On submission, answers are compared against the extracted answer key. Score is reported as a raw score (e.g. 32/40); band-score conversion is out of scope since it varies per test administration and isn't fixed in the book. The student can download a PDF report showing their raw score and each incorrect answer (their answer vs. the correct answer).

# Types of reading questions
There are 11 official IELTS Academic Reading question types. A single reading passage typically contains 2-3 different types, grouped into sets with shared instructions (e.g. "Questions 14-18").

1. **Multiple Choice** - Choose one correct answer from 4 options (A-D), or choose 2+ correct answers from a longer list. UI: radio buttons (single answer) or checkboxes (multiple answers).
2. **Identifying Information (True / False / Not Given)** - Decide whether a statement agrees with, contradicts, or is not addressed by the text. UI: 3-way radio button / select per statement.
3. **Identifying Writer's Views/Claims (Yes / No / Not Given)** - Same mechanic as #2, but judges the statement against the writer's opinions/claims rather than facts. UI: identical to True/False/Not Given.
4. **Matching Information** - Find which lettered paragraph/section contains a specific piece of information. UI: dropdown or drag-drop of paragraph letters per question.
5. **Matching Headings** - Match a list of headings (given as Roman numerals, more headings than paragraphs) to each paragraph. UI: dropdown per paragraph, options consumed once used (unless reuse is allowed by the question).
6. **Matching Features** - Match statements to a list of lettered options (e.g. people, theories, dates); options may be reused. UI: dropdown or drag-drop per statement.
7. **Matching Sentence Endings** - Match a sentence beginning to the correct ending from a list (more endings than beginnings). UI: dropdown per sentence beginning.
8. **Sentence Completion** - Fill a gap in a sentence using words taken directly from the text, under a strict word limit (e.g. "NO MORE THAN TWO WORDS"). UI: free-text input per gap, validated against the word-limit rule.
9. **Summary / Note / Table / Flow-Chart Completion** - Fill gaps in a summary/notes/table/flow-chart, either with words from the text (free-text input) or by choosing from a word bank (dropdown/drag-drop) - the source text specifies which.
10. **Diagram Label Completion** - Label parts of a diagram using words from the text, under a word limit. UI: free-text input positioned next to each diagram label/pointer.
11. **Short-Answer Questions** - Answer a question with words taken from the text, under a word limit. UI: free-text input per question.

Common constraints to enforce at grading time:
- Word-limit questions (#8, #9, #10, #11) are marked wrong if the answer exceeds the stated word/number limit, regardless of correctness.
- Spelling must match the source text exactly (no partial credit).
- Where an option list is "used once only", the same option should not be assignable to two questions in that set (drag-drop naturally enforces this; dropdowns need the used option removed/disabled from other dropdowns).

# 'ielts like' reading
On ielts reading the screen is split in half. At the left there is the text and at the right the questions. Each side scrolls independently.
- **Highlighting**: students can select text on the left and highlight it (and remove highlights); purely a study aid, not graded.
- Question groups on the right show their shared instructions (e.g. word limit, "Choose TWO letters") above the question set.
- **Section navigation bar**: a bar fixed to the bottom of the screen lets the student switch between the test's 3 sections (e.g. "Section 1", "Section 2", "Section 3"). Selecting a section loads that section's passage and questions into the left/right panes; the timer keeps running across section switches, and answers already entered are preserved when navigating away and back.


# Pages
## Upload page
Users upload a pdf
## Test selection page
Users select which test they want
## Test page
Users take the test
## Results page
Users can download the pdf with their results

# Notes
- **Answer key alternatives**: where the source answer key lists multiple acceptable forms for one answer (e.g. "aircraft / plane"), OCR extraction should capture all accepted forms, and grading accepts any of them as correct.
- **Diagram Label Completion**: harder than the text-only question types — requires extracting the diagram image itself plus the position of each label/pointer from the PDF, then placing free-text inputs against those positions. Needs its own extraction approach, not just OCR text extraction.
- **Multiple choice with 2+ correct answers**: graded with partial credit — one point per correct option selected (wrong selections don't earn points).