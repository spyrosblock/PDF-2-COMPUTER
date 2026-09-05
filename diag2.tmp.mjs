// Which parts does analyzeBook actually attempt over a whole book? Every API call
// is stubbed to fail, so each attempted part lands in `failed` and nothing is slow.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
import { splitIntoSkills, splitSkillIntoParts, splitOffAnswers, formatText, formatSkill, setRenderer } from "/tmp/diag/out/pdf/index.js";
import { analyzeBook } from "/tmp/diag/out/analyze/index.js";

globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: "stubbed" }) });
setRenderer(async () => "data:image/jpeg;base64,AAAA");

const file = process.argv[2];
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
const toRuns = (items) => items.filter(i => typeof i.str === "string" && i.str.trim()).map(i => ({ str: i.str, x: i.transform?.[4] ?? 0, y: i.transform?.[5] ?? 0, width: i.width ?? 0, height: i.height ?? 0 }));
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const c = await (await doc.getPage(i)).getTextContent();
  const runs = toRuns(c.items);
  runs.sort((a,b)=>b.y-a.y);
  const lines = [];
  for (const r of runs) { const last = lines[lines.length-1]; if (last && Math.abs(r.y-last[0].y) <= 4) last.push(r); else lines.push([r]); }
  const text = lines.map(l => { l.sort((a,b)=>a.x-b.x); return l.map(r=>r.str).join(" "); }).join("\n");
  pages.push({ page: i, text, source: text.replace(/\s/g,"").length >= 8 ? "text" : "empty" });
}
const built = splitIntoSkills(pages).map((raw) => {
  const { content, answers } = splitOffAnswers(raw);
  return { ...formatSkill(content), parts: splitSkillIntoParts(content), answers: answers ? formatText(answers) : null };
});
console.log("skills:", built.map(s => `${s.test}/${s.skill}(${s.parts.length})`).join(" "));
const result = await analyzeBook("fake", built, () => {});
console.log("\nattempted parts (all should fail, since fetch is stubbed):", result.failed.length);
const bySkill = {};
for (const f of result.failed) { const k = f.includes("Part") ? "Listening" : f.includes("Passage") ? "Reading" : "other"; bySkill[k] = (bySkill[k]||0)+1; }
console.log(bySkill);
console.log("\nfailed:", result.failed.join(" | "));
