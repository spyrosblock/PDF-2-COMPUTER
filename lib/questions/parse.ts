// Reading the model's JSON reply into QuestionGroups. Nothing in the reply is
// guaranteed, so everything here coerces rather than asserts and drops only
// what it can't make sense of. An empty group (no items, body or options) is
// dropped; if that leaves nothing, the caller keeps the extracted text.

import {
  QUESTION_TYPES,
  type Block,
  type Item,
  type Option,
  type OptionList,
  type QuestionGroup,
  type QuestionType,
  type TableRow,
} from "./types";

const TYPES = new Set<string>(QUESTION_TYPES);

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// Printed dot/underscore runs the model copied through become unnumbered gaps.
function gaps(text: string): string {
  return text.replace(/(?:\.\s*){4,}|_{3,}|(?:…\s*){2,}/g, "[[]]");
}

// Text as it will be shown: whitespace collapsed, gaps normalised, and the
// space before punctuation closed up (a gap is now a blank, not a printed rule).
function text(value: unknown): string {
  return gaps(str(value).replace(/\s+/g, " "))
    .replace(/\s+([.,;:?!])/g, "$1")
    .trim();
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

function type(value: unknown): QuestionType {
  const raw = str(value).toLowerCase().replace(/[_\s]+/g, "-");
  return TYPES.has(raw) ? (raw as QuestionType) : "other";
}

// An option is {key, text}; a bare string is accepted as an option whose letter
// the model left off, and one written "A. the cost" is split at the letter.
function option(value: unknown): Option | null {
  if (typeof value === "string") {
    const m = /^\(?([A-Za-z]|[ivxIVX]{1,4}|\d{1,2})[).:\s]\s*(.+)$/.exec(
      value.trim(),
    );
    if (m) return { key: m[1], text: text(m[2]) };
    const only = text(value);
    return only ? { key: "", text: only } : null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as { key?: unknown; letter?: unknown; text?: unknown };
  const key = str(raw.key ?? raw.letter);
  const body = text(raw.text);
  return key || body ? { key, text: body } : null;
}

function options(value: unknown): Option[] {
  return list(value)
    .map(option)
    .filter((o): o is Option => o !== null);
}

function optionList(value: unknown): OptionList | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { title?: unknown; options?: unknown };
  const opts = options(raw.options);
  return opts.length > 0 ? { title: str(raw.title) || null, options: opts } : null;
}

function row(value: unknown): TableRow | null {
  if (Array.isArray(value)) {
    const cells = value.map(text);
    return cells.some(Boolean) ? { header: false, cells } : null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as { header?: unknown; cells?: unknown };
  const cells = list(raw.cells).map(text);
  return cells.some(Boolean) ? { header: raw.header === true, cells } : null;
}

function block(value: unknown): Block | null {
  if (typeof value === "string") {
    const body = text(value);
    return body ? { kind: "paragraph", text: body } : null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as { kind?: unknown; text?: unknown; rows?: unknown };
  const kind = str(raw.kind).toLowerCase();

  if (kind === "table") {
    const rows = list(raw.rows)
      .map(row)
      .filter((r): r is TableRow => r !== null);
    return rows.length > 0 ? { kind: "table", rows } : null;
  }

  const body = text(raw.text);
  if (!body) return null;
  if (kind === "heading" || kind === "bullet") return { kind, text: body };
  return { kind: "paragraph", text: body };
}

function item(value: unknown): Item | null {
  if (typeof value === "string") {
    const body = text(value);
    return body ? { n: null, text: body, select: 1, options: [] } : null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    n?: unknown;
    number?: unknown;
    text?: unknown;
    select?: unknown;
    options?: unknown;
  };
  const body = text(raw.text);
  const opts = options(raw.options);
  if (!body && opts.length === 0) return null;
  return {
    n: num(raw.n ?? raw.number),
    text: body,
    select: num(raw.select) ?? 1,
    options: opts,
  };
}

function group(value: unknown): QuestionGroup | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    type?: unknown;
    heading?: unknown;
    instructions?: unknown;
    optionList?: unknown;
    options?: unknown;
    body?: unknown;
    items?: unknown;
  };

  const instructions = list(raw.instructions)
    .map(text)
    .filter(Boolean);
  const body = list(raw.body)
    .map(block)
    .filter((b): b is Block => b !== null);
  const items = list(raw.items)
    .map(item)
    .filter((i): i is Item => i !== null);
  // `optionList` is what the prompt asks for; a bare `options` array means the same.
  const loose = options(raw.options);
  const shared =
    optionList(raw.optionList) ??
    (loose.length > 0 ? { title: null, options: loose } : null);

  if (items.length === 0 && body.length === 0 && !shared) return null;

  return {
    type: type(raw.type),
    heading: str(raw.heading),
    instructions,
    optionList: shared,
    body,
    items,
  };
}

// Read a parsed reply into groups. Returns [] when the reply carries none, which
// the caller treats as a failed structuring rather than an empty question set.
export function parseGroups(reply: unknown): QuestionGroup[] {
  const groups = Array.isArray(reply)
    ? reply
    : list((reply as { groups?: unknown } | null)?.groups);
  return groups.map(group).filter((g): g is QuestionGroup => g !== null);
}
