"use client";

// Giving a question set the picture it is answered against (a Listening Part 2
// map, a labelled reading diagram). The page is narrowed down by the set's own
// "Label the map below." line; where on the page it sits is decided by the API
// looking at the rendered image (/api/figure) — and if that fails, the whole
// page is shown instead.

import { splitByPage, type CropBox, type Part } from "@/lib/pdf";
import { needsFigure, type Figure, type QuestionGroup } from "@/lib/questions";
import { post, type RenderPage } from "./shared";

// Pages to try per set before showing the first one whole.
const MAX_PAGES = 3;

// An instruction naming a picture, as the book phrases it. Picks the page;
// whether the set needs one is needsFigure's job.
const NAMES_PICTURE = /\b(map|plan|diagram)\b/i;

type FigureReply = {
  found: boolean;
  box?: CropBox | null;
  alt?: string;
};

// Compare printed text the way a reader would, so a heading survives the
// extraction's spacing and its choice of dash.
function loose(text: string): string {
  return text
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// Candidate pages for a set's picture, best guess first: page naming a picture,
// then the set's heading page, then the rest of the part.
function candidatePages(part: Part, group: QuestionGroup): number[] {
  const pages = splitByPage(part.text);
  const heading = loose(group.heading);

  const names = pages
    .filter((p) => NAMES_PICTURE.test(p.text))
    .map((p) => p.page);
  const headed = heading
    ? pages.filter((p) => loose(p.text).includes(heading)).map((p) => p.page)
    : [];
  const all: number[] = [];
  for (let p = part.startPage; p <= part.endPage; p++) all.push(p);

  return [...new Set([...names, ...headed, ...all])].slice(0, MAX_PAGES);
}

// Ask the API where the picture is on one page, and render it (cropped when a
// box came back). Returns null when the page has no picture.
async function figureOnPage(
  page: number,
  group: QuestionGroup,
  image: RenderPage,
  pageImage: string,
): Promise<Figure | null> {
  const reply = await post<FigureReply>("/api/figure", {
    page,
    image: pageImage,
    heading: group.heading,
    instructions: group.instructions,
  });
  if (!reply.found) return null;

  // A box we were given is worth a second render, cropped to it. Without one the
  // page we already rendered stands in.
  if (reply.box) {
    return {
      image: await image(page, reply.box),
      alt: reply.alt ?? "",
      page,
      cropped: true,
    };
  }
  return { image: pageImage, alt: reply.alt ?? "", page, cropped: false };
}

// Find one group's picture, probing candidate pages sequentially (a miss on
// page A says nothing about page B). Failures are swallowed: better to lose the
// map than the whole part.
async function findFigure(
  part: Part,
  group: QuestionGroup,
  image: RenderPage,
  pageImage: (page: number) => Promise<string>,
): Promise<Figure | null> {
  let figure: Figure | null = null;
  let firstTried: { page: number; shot: string } | null = null;
  try {
    for (const page of candidatePages(part, group)) {
      const shot = await pageImage(page);
      firstTried ??= { page, shot };
      figure = await figureOnPage(page, group, image, shot);
      if (figure) break;
    }
  } catch (err) {
    console.error(`Finding the figure for "${group.heading}" failed:`, err);
  }

  // The set needs a picture the API couldn't point at: show the most likely
  // page, whole.
  if (!figure && firstTried) {
    figure = {
      image: firstTried.shot,
      alt: "",
      page: firstTried.page,
      cropped: false,
    };
  }
  return figure;
}

// Attach a figure to every group that needs one. Groups run side by side;
// within a group the pages are probed in turn. Pages are rendered once each.
export async function attachFigures(
  part: Part,
  groups: QuestionGroup[],
  image: RenderPage,
): Promise<QuestionGroup[]> {
  // One render per page, however many sets point at it.
  const rendered = new Map<number, Promise<string>>();
  const pageImage = (page: number) => {
    const existing = rendered.get(page);
    if (existing) return existing;
    const fresh = image(page);
    rendered.set(page, fresh);
    return fresh;
  };

  const figures = await Promise.all(
    groups
      .filter(needsFigure)
      .map((group) => findFigure(part, group, image, pageImage)),
  );

  return groups.map((group) => {
    if (!needsFigure(group)) return group;
    const figure = figures.shift();
    return figure ? { ...group, figure } : group;
  });
}
