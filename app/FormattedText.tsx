// Renders cleaned skill/part text (lib/pdf/format.ts) as prose: a <p> per
// "\n\n"-separated paragraph. Books saved before formatting existed render as
// a single block until re-upload.
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
