"use client";

// Turning one writing task into its task description.
//
// Task 2's extracted text is the description plus the furniture around it — the
// "WRITING TASK 2" heading, the page banners, and whatever the extractor swept in
// after the closing "Write at least 250 words." line. Telling description from
// furniture is a judgement call, so it goes to the Claude API through our own
// route, like every other read of the book:
//
//   POST /api/writing/prompt  ->  the task description on its own
//
// Task 1 is not read at all: it is a chart / graph / map whose real content is
// the page image (kept by lib/pdf/render.ts), and its text is garbled OCR of
// that visual — the UI hides it and shows the image instead.

import type { Part } from "@/lib/pdf";
import { post } from "./shared";

// The label parts.ts gives Writing Task 2 — the only task whose text is read.
const TASK_TWO_LABEL = "Task 2";

export async function analyzeWritingPart(part: Part): Promise<Partial<Part>> {
  if (part.label !== TASK_TWO_LABEL) return {};
  const { prompt } = await post<{ prompt: string }>("/api/writing/prompt", {
    text: part.text,
  });
  return prompt ? { writing: { prompt } } : {};
}