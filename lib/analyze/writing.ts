"use client";

// Turning one writing task into its task description via
// POST /api/writing/prompt. Task 1 is not read at all: it is a chart whose
// real content is the page image (lib/pdf/render.ts) — the UI hides its text
// and shows the image instead.

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