"use client";

// Giving a question set the picture it is answered against.
//
// Listening Part 2 usually prints a map of a park or a plan of a building and
// asks the student to write letters onto it; a reading passage occasionally ends
// with a labelled diagram. None of that is text — the extraction sees the picture
// as stray brackets and digits, and the questions beside it ("16 Farm shop
// ........") are unanswerable without it. So the picture is rendered out of the
// PDF and hung on the group.
//
// Two things have to be worked out: which printed page the picture is on, and
// where on that page it sits. The page we can narrow down ourselves — the set's
// own instruction line ("Label the map below.") was printed above it, so the page
// carrying that line is the page carrying the picture. Where it sits on the page
// only the API can say, looking at the rendered image (app/api/figure), and if it
// can't say usefully the whole page is shown instead: a student can read a whole
// printed page perfectly well, they just can't read a map that isn't there.

import { splitByPage, type CropBox, type Part } from "@/lib/pdf";
import { needsFigure, type Figure, type QuestionGroup } from "@/lib/questions";
import { post, type RenderPage } from "./shared";

// How many pages to try per set before giving up and showing the first of them
// whole. The picture is nearly always on the page that names it, so this only
// bites when the extraction lost the instruction line.
const MAX_PAGES = 3;

// The instruction that names a picture, as the book phrases it. Used to pick the
// page, not to decide whether the set needs one — that is needsFigure's job.
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

// The pages of `part` that might carry this set's picture, best guess first: the
// page whose text names a picture, then the page carrying the set's heading, then
// the rest of the part in printed order. A picture printed at the top of the
// following page still gets its turn, since every page of the part is a candidate
// in the end.
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

// Ask the API where the picture is on one page, and render it. Returns null when
// the page carries no picture at all.
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

// Attach a figure to every group in `groups` that can't be answered without one.
// Groups that need none — and books whose parts have none — pass straight
// through, and the PDF is only rendered when a figure is actually wanted.
//
// Failures are swallowed: a set shown without its map is worse than one with it,
// but far better than losing the whole part because one image request timed out.
export async function attachFigures(
  part: Part,
  groups: QuestionGroup[],
  image: RenderPage,
): Promise<QuestionGroup[]> {
  if (!groups.some(needsFigure)) return groups;

  // One render per page, however many of the part's sets point at it.
  const rendered = new Map<number, Promise<string>>();
  const pageImage = (page: number) => {
    const existing = rendered.get(page);
    if (existing) return existing;
    const fresh = image(page);
    rendered.set(page, fresh);
    return fresh;
  };

  const out: QuestionGroup[] = [];
  for (const group of groups) {
    if (!needsFigure(group)) {
      out.push(group);
      continue;
    }

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

    // The set plainly needs a picture and the API found none it could point at.
    // Show the page it was most likely printed on, whole.
    if (!figure && firstTried) {
      figure = {
        image: firstTried.shot,
        alt: "",
        page: firstTried.page,
        cropped: false,
      };
    }

    out.push(figure ? { ...group, figure } : group);
  }
  return out;
}
