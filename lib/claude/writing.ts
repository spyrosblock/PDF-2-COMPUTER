// Prompts for writing extraction.
//
// A Writing task has no question sets to read — Task 1 is a chart kept as a page
// image, and Task 2 is a prompt the student answers in prose. What Task 2 needs
// digitised is the task description on its own: the extracted text carries the
// "WRITING TASK 2" heading, the page banners, and whatever fragments of the next
// section the extractor swept in after the closing "Write at least 250 words."
// line, and telling description from furniture is a judgement call rather than a
// regex. So it goes to the model, like every other read of the book.
//
// The prompt lives here (not in the route) for the same reason reading's do: it
// describes the input format, and that description has to stay in one place.

import { INPUT_FORMAT } from "./shared";

// What a clean task description is made of, as the example the prompt holds up
// shows: the instruction lines, the topic, and the closing instructions.
const EXAMPLE = `Write at least 250 words. You should spend about 40 minutes on this task. Write about the following topic: Give reasons for your answer and include any relevant examples from your own knowledge or experience. Access to clean water is a basic human right. Therefore, every home should have a water supply that is provided free of charge. Do you agree or disagree? Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.`;

export function taskPromptPrompt(text: string): string {
  return `You are digitising Writing Task 2 of an IELTS Academic test so a student can sit it on screen.

${INPUT_FORMAT}

Return ONLY the task description: the instruction lines ("You should spend about 40 minutes on this task.", "Write about the following topic:"), the topic itself, and the closing instructions ("Give reasons for your answer and include any relevant examples from your own knowledge or experience.", "Write at least 250 words."), copied word for word and in printed order.

Leave out everything that is not part of the task description, before or after it: the "WRITING TASK 2" heading, the page banners, the running headers and footers, and any fragments of the next section the extraction swept in after the task's last line.

A clean task description reads like this:

${EXAMPLE}

Output the task description and nothing else — no preamble, no commentary, no markdown fences.

--- extracted text ---
${text}`;
}