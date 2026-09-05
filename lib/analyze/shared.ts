"use client";

// The machinery every part's analysis shares.
//
// Reading and listening are read out of the book the same way — check the text,
// get the questions (whole, or a page at a time with the pages the API asked to
// see rendered as images), then structure them — so that walk lives here once,
// pointed at whichever skill's routes by `QuestionRoutes`. What differs is what
// each skill wraps around it: reading also splits off the passage, listening also
// finds the pictures its questions are answered against.
//
// The Claude API key never reaches the browser: nothing here calls it directly,
// only our own routes under /api, which hold the prompts and make the upstream
// calls (see lib/claude/client.ts).

import {
  openPdf,
  renderPageImage,
  splitByPage,
  type CropBox,
  type Part,
  type PartQuestions,
} from "@/lib/pdf";
import type { QuestionGroup } from "@/lib/questions";

// Where one skill's three steps live.
export type QuestionRoutes = {
  questions: string; // check the text, and read the questions if it passes
  page: string; // read one printed page, optionally with its image
  structure: string; // describe the questions as question groups
};

// Renders a page of the book, whole or cropped, on demand.
export type RenderPage = (page: number, box?: CropBox) => Promise<string>;

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(detail?.error ?? `${url} responded ${res.status}.`);
  }
  return (await res.json()) as T;
}

type QuestionsReply =
  | { status: "ok"; questions: string }
  | { status: "need-pages"; pages: number[] };

// Opens the PDF the first time a page image is actually wanted, and keeps it open
// for the rest of the run — most parts never need one, and re-opening per page
// would re-parse the whole file each time.
export function lazyRenderer(file: File): {
  image: RenderPage;
  close: () => Promise<void>;
} {
  let opened: ReturnType<typeof openPdf> | null = null;
  return {
    async image(page, box) {
      opened ??= openPdf(file);
      const { doc } = await opened;
      return renderPageImage(doc, page, box);
    },
    async close() {
      if (!opened) return;
      await opened.then(({ close }) => close()).catch(() => {});
    },
  };
}

// The pages to walk: every page of the part that has text, plus any page the
// model asked for that has none (a page whose text layer came out empty is
// exactly the kind it asks to see), in printed order.
function pagesToWalk(
  part: Part,
  wanted: number[],
): { page: number; text: string }[] {
  const pages = splitByPage(part.text);
  const known = new Set(pages.map((p) => p.page));
  const extra = wanted
    .filter((p) => !known.has(p))
    .map((page) => ({ page, text: "" }));
  return [...pages, ...extra].sort((a, b) => a.page - b.page);
}

// The last step. Best-effort: a part whose questions can't be structured still
// has them as text, so a failure here is logged and swallowed rather than losing
// the part.
async function structure(
  route: string,
  questions: string,
): Promise<QuestionGroup[] | undefined> {
  if (!questions.trim()) return undefined;
  try {
    const { groups } = await post<{ groups: QuestionGroup[] }>(route, {
      questions,
    });
    return groups.length > 0 ? groups : undefined;
  } catch (err) {
    console.error("Structuring the questions failed:", err);
    return undefined;
  }
}

// Read one part's questions: as text, and — when that step manages it — as
// question groups. Shared by both skills; see lib/analyze/reading.ts and
// lib/analyze/listening.ts for what each adds around it.
export async function readQuestions(
  part: Part,
  routes: QuestionRoutes,
  image: RenderPage,
): Promise<PartQuestions> {
  const check = await post<QuestionsReply>(routes.questions, {
    text: part.text,
  });
  if (check.status === "ok") {
    return {
      questions: check.questions,
      groups: await structure(routes.structure, check.questions),
      imagePages: [],
    };
  }

  // Ignore any page outside this part — the model only ever sees this part's
  // text, so a page number beyond it is a misread rather than a real request.
  const wanted = check.pages.filter(
    (p) => p >= part.startPage && p <= part.endPage,
  );

  const chunks: string[] = [];
  for (const page of pagesToWalk(part, wanted)) {
    const { questions } = await post<{ questions: string }>(routes.page, {
      page: page.page,
      text: page.text,
      image: wanted.includes(page.page) ? await image(page.page) : undefined,
    });
    if (questions) chunks.push(questions);
  }

  // The page-by-page walk hands back one chunk per page, so a question set that
  // straddled a page break is split across two of them. Structuring runs on the
  // joined text, which puts it back together.
  const questions = chunks.join("\n\n");
  return {
    questions,
    groups: await structure(routes.structure, questions),
    imagePages: wanted,
  };
}

// Run `fn` over the items with at most `limit` in flight, keeping the results in
// the items' own order.
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) {
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}
