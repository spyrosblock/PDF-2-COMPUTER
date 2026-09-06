# P2C — PDF to Computer

Turn a Cambridge *IELTS Academic authentic practice tests* PDF into a
computer-delivered practice test: the student uploads the book they already own,
the app digitises its tests and lets them sit Listening, Reading and Writing in
the on-screen format used at the exam centre — then marks the paper against the
book's own answer key.

Goals and the intended test experience are in [SPECS.md](SPECS.md).

## Getting started

```bash
npm install          # also copies the pdf.js runtime assets into public/pdfjs
cp .env.example .env # then fill in the provider key (see below)
npm run dev
```

Open <http://localhost:3000> and upload a book PDF. Nothing is pre-loaded — the
app ships with no test content.

## Configuration

All extraction goes through one server-side client, `lib/claude/client.ts`,
which talks to either a hosted Claude endpoint or OpenRouter. Copy
`.env.example` to `.env` and set:

| Variable | Required | Meaning |
| --- | --- | --- |
| `AI_PROVIDER` | no | `claude` (default) or `openrouter`. Unset with `OPENROUTER_API_KEY` present also selects OpenRouter. |
| `CLAUDE_API_KEY` | with `claude` | Sent as the `X-API-Key` header. |
| `CLAUDE_API_URL` | no | Defaults to the endpoint in `lib/claude/client.ts`. |
| `OPENROUTER_API_KEY` | with `openrouter` | Bearer token for `openrouter.ai/api/v1`. |
| `OPENROUTER_MODEL` | with `openrouter` | Model slug. Must accept images. |

These are read on the server only. Never rename one to `NEXT_PUBLIC_*` — that
would ship the key to the browser.

## How a book becomes a test

1. **Extract** (`lib/pdf`, in the browser). pdf.js reads each page's text layer;
   pages without a usable one (scans) fall back to Tesseract OCR. The book is
   then split into per-test skills, each skill into parts, and the printed
   answer key is split off the end of each Listening and Reading skill.
2. **Analyse** (`lib/analyze` → `app/api/*`). The extracted text — plus rendered
   page images where a question set needs one — is sent to the model, ten parts
   at a time. Reading parts come back as passage + question groups, Listening as
   question groups + the figures they are answered against, Writing Task 2 as
   its task description, and each answer key as markable answers. Writing
   Task 1 is never read — its chart page is rasterised and shown as an image.
   This is the only step that leaves the machine, and by far the slowest.
   A part whose analysis fails keeps its raw text rather than sinking the whole
   book.
3. **Store** (`lib/books.ts`). The finished book is saved to IndexedDB, so it
   survives reloads and several books can sit side by side. Answers
   (`lib/answers.ts`) and per-skill timers (`lib/timers.ts`) live in
   localStorage, keyed by book/test/skill.
4. **Sit and mark** (`app/tests/...`). A skill page shows its parts as tabs with
   a stopwatch; submitting stops the timer and marks the sheet against the
   extracted key (`lib/questions`), accepting any of the forms the book allows.

Add `?debug` to any page URL to reveal the extraction internals (raw page text,
part splits, parsed question groups).

## Layout

```
app/           pages (upload, book, test, skill) and the extraction API routes
lib/pdf/       PDF text extraction, OCR, splitting, page rendering
lib/analyze/   orchestrates the per-part model calls with a concurrency pool
lib/claude/    provider client, prompts and reply parsing
lib/questions/ question model, answer-key parsing, marking
scripts/       copies pdf.js runtime assets into public/pdfjs
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server (runs `copy-pdfjs-assets` first) |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |
| `npm run copy-pdfjs-assets` | Refresh `public/pdfjs` from the installed `pdfjs-dist` |

`public/pdfjs` is generated, not checked in: pdf.js fetches its WASM decoders,
standard fonts, CMaps and ICC profiles by URL at runtime, and a scanned book
renders blank without them.

## Notes

- Built on Next.js 16 (App Router) with React 19 and Tailwind 4. This project
  targets that version's APIs — see [AGENTS.md](AGENTS.md).
- Book PDFs never leave the browser as files; only extracted text and, where
  needed, single rendered page images are sent to the model.
