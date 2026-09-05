// Server-side client for the hosted Claude endpoint.
//
// The endpoint takes a prompt plus optional files and answers with
// `{ "output": "<the model's reply>" }`. Two request shapes, and they are not
// interchangeable: with no files it must be a JSON body, with files it must be
// multipart (the server rejects a multipart request whose `text` field arrives
// without a file). askClaude picks the right one.
//
// The API key lives in .env as CLAUDE_API_KEY and is read here only. This module
// must never be imported from a client component — the routes under
// app/api/reading are the only callers, so the key stays on the server.
//
// Second provider: setting AI_PROVIDER=openrouter in .env routes every call
// through OpenRouter's chat-completions API instead (OPENROUTER_API_KEY,
// OPENROUTER_MODEL). The rest of the codebase only ever sees askClaude, so the
// switch lives entirely inside this module.

const DEFAULT_URL = "https://a1vm.duckdns.org/api/claude";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Page-image reads are the slow case (a whole page rasterised at 2x), so the
// timeout is generous; without one a hung upstream would pin a request forever.
const TIMEOUT_MS = 240_000;

export type Attachment = {
  name: string; // filename the endpoint sees, e.g. "page-12.jpg"
  type: string; // MIME type, e.g. "image/jpeg"
  bytes: ArrayBuffer;
};

// Ask Claude one question and return its reply text. Attachments (if any) are
// sent under the repeated `file` field the endpoint expects.
export async function askClaude(
  text: string,
  attachments: Attachment[] = [],
): Promise<string> {
  if (
    process.env.AI_PROVIDER === "openrouter" ||
    (!process.env.AI_PROVIDER && process.env.OPENROUTER_API_KEY)
  ) {
    return askOpenRouter(text, attachments);
  }

  const key = process.env.CLAUDE_API_KEY;
  if (!key) {
    throw new Error(
      "CLAUDE_API_KEY is not set — add it to .env (see lib/claude/client.ts).",
    );
  }
  const url = process.env.CLAUDE_API_URL || DEFAULT_URL;

  const headers: Record<string, string> = { "X-API-Key": key };
  let body: BodyInit;
  if (attachments.length === 0) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ text });
  } else {
    const form = new FormData();
    form.append("text", text);
    for (const a of attachments) {
      form.append("file", new Blob([a.bytes], { type: a.type }), a.name);
    }
    body = form; // fetch sets the multipart boundary itself
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Claude API returned ${res.status}. ${detail}`);
  }

  const data: unknown = await res.json();
  const output =
    data && typeof data === "object" ? (data as { output?: unknown }).output : undefined;
  if (typeof output !== "string") {
    throw new Error("Claude API response carried no output text.");
  }
  return output.trim();
}

// The same question, answered through OpenRouter. Attachments become base64
// data-URL image parts on the message — the shape OpenRouter's vision-capable
// models expect. The reply is choices[0].message.content.
async function askOpenRouter(
  text: string,
  attachments: Attachment[],
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — add it to .env (see lib/claude/client.ts).",
    );
  }
  const model = process.env.OPENROUTER_MODEL;
  if (!model) {
    throw new Error(
      "OPENROUTER_MODEL is not set — add it to .env (see lib/claude/client.ts).",
    );
  }

  // Text-only calls take a plain string content; with images, the content is a
  // part array with the prompt first and each attachment as an image part.
  const content: unknown =
    attachments.length === 0
      ? text
      : [
          { type: "text", text },
          ...attachments.map((a) => ({
            type: "image_url",
            image_url: {
              url: `data:${a.type};base64,${Buffer.from(a.bytes).toString("base64")}`,
            },
          })),
        ];

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`OpenRouter API returned ${res.status}. ${detail}`);
  }

  const data: unknown = await res.json();
  const message =
    data && typeof data === "object"
      ? (
          data as {
            choices?: { message?: { content?: unknown } }[];
          }
        ).choices?.[0]?.message
      : undefined;
  const output = message?.content;
  if (typeof output !== "string" || output.trim() === "") {
    throw new Error("OpenRouter API response carried no output text.");
  }
  return output.trim();
}

// The models are asked to answer with a bare JSON object, but they sometimes wrap
// it in a ```json fence or add a sentence around it. Pull out the outermost
// {...} and parse that; null if there isn't one or it doesn't parse.
export function parseJsonObject<T>(reply: string): T | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// Prompts tell the model to answer "NONE" when a page (or a part) carries nothing
// of the kind we asked for — normalise that to an empty string.
export function textOrEmpty(reply: string): string {
  const trimmed = reply.trim();
  return /^none\.?$/i.test(trimmed) ? "" : trimmed;
}

// Ask for a block of text rather than a JSON verdict.
//
// `retryIfEmpty` is for the calls where an empty answer cannot be right — a
// reading part always has a passage, a page the model asked to see always has
// questions on it. It answers NONE to those anyway, roughly one time in seven,
// and asking again unchanged has answered properly every time since. So: one
// retry, and only where the caller knows the emptiness is wrong. Where NONE is a
// legitimate answer (a page that really is all passage) the caller leaves this
// off and the first answer stands.
export async function askClaudeForText(
  prompt: string,
  attachments: Attachment[] = [],
  retryIfEmpty = false,
): Promise<string> {
  const first = textOrEmpty(await askClaude(prompt, attachments));
  if (first || !retryIfEmpty) return first;
  return textOrEmpty(await askClaude(prompt, attachments));
}

// Turn a canvas data URL ("data:image/jpeg;base64,...") into bytes we can attach.
// The client renders page images with canvas.toDataURL, so this is the form they
// arrive in. Throws on anything that isn't a base64 data URL.
export function dataUrlToAttachment(dataUrl: string, name: string): Attachment {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) throw new Error("Page image was not a base64 data URL.");
  // Copied into an ArrayBuffer of its own: Buffer.from hands back a view into a
  // shared pool, whose raw .buffer would carry unrelated bytes with it.
  const decoded = Buffer.from(m[2], "base64");
  const bytes = new ArrayBuffer(decoded.byteLength);
  new Uint8Array(bytes).set(decoded);
  return { name, type: m[1], bytes };
}
