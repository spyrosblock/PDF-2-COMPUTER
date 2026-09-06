"use client";

// The machinery every part's analysis shares: check the text, read the
// questions (whole, or a page at a time with images), then structure them —
// pointed at a skill's routes by `QuestionRoutes`. Never calls the Claude API
// directly; only our /api routes do.

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

// Opens the PDF on first use and keeps it open — most parts never need a page
// image, and re-opening per page would re-parse the file each time.
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

// The pages to walk: every page with text, plus any requested page without
// (an empty text layer is exactly the kind the model asks to see), in order.
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

// The last step, best-effort: failure is logged and swallowed, leaving the
// questions as text.
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

// Read one part's questions as text and, when structuring succeeds, as
// question groups. Shared by both skills.
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

  // Ignore pages outside this part — a page number beyond it is a misread.
  const wanted = check.pages.filter(
    (p) => p >= part.startPage && p <= part.endPage,
  );

  // Pages are independent reads, so they all go up at once; `Promise.all`
  // keeps the replies in printed order for the join.
  const replies = await Promise.all(
    pagesToWalk(part, wanted).map(async (page) => {
      const { questions } = await post<{ questions: string }>(routes.page, {
        page: page.page,
        text: page.text,
        image: wanted.includes(page.page)
          ? await image(page.page)
          : undefined,
      });
      return questions;
    }),
  );
  const chunks = replies.filter((questions) => questions !== "");

  // One chunk per page; structuring runs on the joined text, which puts a set
  // straddling a page break back together.
  const questions = chunks.join("\n\n");
  return {
    questions,
    groups: await structure(routes.structure, questions),
    imagePages: wanted,
  };
}

// Run `fn` over the items with at most `limit` in flight, results in order.
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
