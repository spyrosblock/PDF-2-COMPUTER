// Renders cleaned section text (see lib/pdf/format.ts) as readable prose.
//
// The stored text uses "\n\n" between paragraphs; we split on that and emit a
// <p> per paragraph inside a scrollable box. Replaces the old monospace <pre>
// dump. Older books saved before formatting existed have no "\n\n" structure,
// so they render as a single block — functional, if not pretty, until re-upload.
export function FormattedText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <div className="max-h-[70vh] space-y-3 overflow-auto rounded-lg border border-black/10 bg-black/2 p-5 text-sm leading-relaxed dark:border-white/10 dark:bg-white/3">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
        </p>
      ))}
    </div>
  );
}
