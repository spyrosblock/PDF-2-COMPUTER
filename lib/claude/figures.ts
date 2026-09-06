// Finding the picture a question set is answered against (a Listening Part 2
// map, a labelled reading diagram). The model, already looking at the page
// image, gives the picture's bounding box; we crop to it (lib/pdf/render.ts).
// An unbelievable box is dropped and the whole page shown — a clumsy page beats
// a crop with half the map missing.

// The box as width/height fractions (the model answers in percentages).
export type FigureBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type FigureFound = {
  box: FigureBox | null; // null when the whole page should be shown
  alt: string; // a sentence describing the picture, for the image's alt text
};

export function figurePrompt(
  page: number,
  heading: string,
  instructions: string[],
): string {
  const set = [heading, ...instructions].filter(Boolean).join(" — ");

  return `The attached image is the whole of printed page ${page} of an IELTS test. One set of questions on it is answered against a picture — a map, a plan or a diagram — printed on the page:

${set || "a set of questions answered by labelling a picture"}

Find that picture and give me the rectangle it occupies.

Reply with ONE JSON object and nothing else, either:
{"found": true, "box": {"left": 8, "top": 22, "right": 92, "bottom": 61}, "alt": "A map of Farley House and its grounds, with lettered markers A-H."}
or, if the page carries no such picture at all:
{"found": false}

The four numbers are percentages of the page: "left" and "right" measured across from the left edge, "top" and "bottom" measured down from the top edge. The rectangle must contain the whole picture — its title, every label written on it and every lettered marker on it — and as little else as it can: not the instruction lines above it, and not the numbered list of questions printed beside or below it. Where you are unsure of an edge, put it a little further out rather than a little further in; a picture with a corner cut off is useless to the student.

"alt" is one short sentence describing what the picture shows, for a student who cannot see it.

Output the JSON object and nothing else — no preamble, no commentary, no markdown fences.`;
}

// A box must be big enough to be the picture and small enough to be a crop;
// anything else means "show the whole page".
const MIN_SIDE = 0.1;
const MAX_AREA = 0.92;

// The crop is grown a little on every side — a too-tight box loses an edge marker.
const PADDING = 0.02;

function fraction(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  // Percentages are what the prompt asks for, but a model that answered in
  // fractions meant the same rectangle.
  const f = n > 1 ? n / 100 : n;
  return f >= 0 && f <= 1 ? f : null;
}

function box(value: unknown): FigureBox | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const left = fraction(raw.left ?? raw.x0);
  const top = fraction(raw.top ?? raw.y0);
  const right = fraction(raw.right ?? raw.x1);
  const bottom = fraction(raw.bottom ?? raw.y1);
  if (left === null || top === null || right === null || bottom === null) {
    return null;
  }

  const padded = {
    left: Math.max(0, left - PADDING),
    top: Math.max(0, top - PADDING),
    right: Math.min(1, right + PADDING),
    bottom: Math.min(1, bottom + PADDING),
  };
  const width = padded.right - padded.left;
  const height = padded.bottom - padded.top;
  if (width < MIN_SIDE || height < MIN_SIDE) return null;
  if (width * height > MAX_AREA) return null;
  return padded;
}

// Read the model's reply. `null` = no picture found; a null box = found but
// unusable rectangle, so the whole page stands in.
export function parseFigure(reply: {
  found?: unknown;
  box?: unknown;
  alt?: unknown;
}): FigureFound | null {
  if (reply.found === false || reply.found === "false") return null;
  const found = box(reply.box);
  const alt = typeof reply.alt === "string" ? reply.alt.trim() : "";
  // No usable box and no "found": treat as "nothing here".
  if (!found && reply.found === undefined) return null;
  return { box: found, alt };
}
