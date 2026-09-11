# P2C — PDF to Computer

Turn a Cambridge *IELTS Academic authentic practice tests* PDF into a
computer-delivered practice test: the student uploads the book they already own,
the app digitises its tests and lets them sit Listening, Reading and Writing in
the on-screen format used at the exam centre — then marks the paper against the
book's own answer key.

Goals and the intended test experience are in [SPECS.md](SPECS.md).

## Demo

[![P2C demo video](https://img.youtube.com/vi/Pv5XpA_dYWc/hqdefault.jpg)](https://youtu.be/Pv5XpA_dYWc)

A walkthrough of uploading a book and sitting a test: <https://youtu.be/Pv5XpA_dYWc>

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

## Planned changes to the pipeline

Wanted, not implemented. Nothing here describes current behaviour. All three
attack step 2's cost: a book spends roughly 150 model calls there before the
student answers a single question.

- **Analyse lazily, not upfront.** The biggest win. Upload analyses every part
  of every skill of all four tests, though a student sits one skill at a time.
  Analysing only the skill they open — cached in the IndexedDB record the book
  already lives in — makes that ~15-20 calls for the skill actually sat, spread
  over real use instead of one long wait. `analyzeBook` already works part by
  part over a target list, so what changes is *when* it runs and how a
  half-analysed book is stored and re-entered.
- **Batch the answer keys.** A book's 8 keys (Listening + Reading × 4 tests) are
  8 calls for 8 short replies. One call per skill across the tests, or one for
  the book, cuts that to 2 or 1. Books printing a single back-of-book key
  section (`splitBookAnswers`) already hold the text in one block. The reply
  then has to be keyed by test and skill, and a failed batch costs four tests'
  marking instead of one — so it wants the retry a part gets.
- **OCR from the API.** Scans (Cambridge 5 and 14 among the samples) go through
  Tesseract in the browser: ~140 pages, slow, and it drops display-size titles
  and table columns that splitting then works around. The model already reads
  rendered pages for question sets it can't parse from text
  (`lib/claude/figures.ts`), so a scanned page could go to it as an image
  instead — better text, no `tesseract.js`, at a call per scanned page. That
  cost stops mattering once analysis is lazy and only the pages of the skill
  being sat are read.

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
