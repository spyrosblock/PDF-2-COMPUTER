// End-to-end diagnostic: the real client split + the real lib/analyze
// orchestration, against the dev server. Only the canvas render is stubbed
// (poppler + PIL instead of a browser canvas).
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { splitIntoSkills, splitSkillIntoParts, splitOffAnswers, formatText, formatSkill, setRenderer } from "/tmp/diag/out/pdf/index.js";
import { analyzeBook } from "/tmp/diag/out/analyze/index.js";

const BASE = process.env.BASE || "http://localhost:3001";
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => realFetch(String(url).startsWith("/") ? BASE + url : url, init);

const file = process.argv[2];
const only = process.argv[3] || "Listening";

setRenderer((page, box) => {
  const out = `/tmp/diag/pg`;
  execFileSync("pdftoppm", ["-jpeg", "-r", "150", "-f", String(page), "-l", String(page), file, out]);
  const found = fs.readdirSync("/tmp/diag").find((f) => f.startsWith("pg-") && f.includes(String(page).padStart(3, "0")));
  let path = "/tmp/diag/" + found;
  if (box) {
    execFileSync("python3", ["-c", `
from PIL import Image
im = Image.open("${path}"); w,h = im.size
im.crop((int(${box.left}*w), int(${box.top}*h), int(${box.right}*w), int(${box.bottom}*h))).save("/tmp/diag/crop.jpg")
`]);
    path = "/tmp/diag/crop.jpg";
  }
  const b64 = "data:image/jpeg;base64," + fs.readFileSync(path).toString("base64");
  fs.rmSync("/tmp/diag/" + found, { force: true });
  return b64;
});

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
const COLUMN_SEPARATOR = " | ", COLUMN_FACTOR = 1.2, COLUMN_FLOOR = 8, SPACE_FACTOR = 0.2, Y_FACTOR = 0.4, Y_TOL_CAP = 6;
const toRuns = (items) => items.filter(i => typeof i.str === "string" && i.str.trim()).map(i => ({ str: i.str, x: i.transform?.[4] ?? 0, y: i.transform?.[5] ?? 0, width: i.width ?? 0, height: i.height ?? 0 }));
const medianHeight = (r) => { const hs = r.map(x=>x.height).filter(h=>h>0).sort((a,b)=>a-b); return hs.length ? hs[Math.floor(hs.length/2)] : 10; };
function joinLine(line, fb) {
  const h = Math.max(0, ...line.map(r=>r.height)) || fb, colGap = Math.max(COLUMN_FLOOR, COLUMN_FACTOR*h), spaceGap = SPACE_FACTOR*h;
  let out = line[0].str;
  for (let i=1;i<line.length;i++){ const gap = line[i].x - (line[i-1].x + line[i-1].width); out += gap > colGap ? COLUMN_SEPARATOR : gap > spaceGap ? " " : ""; out += line[i].str; }
  return out;
}
function textFromContent(items) {
  const runs = toRuns(items); if (!runs.length) return "";
  const median = medianHeight(runs), yTol = Math.min(Y_TOL_CAP, Y_FACTOR*median);
  runs.sort((a,b)=>b.y-a.y);
  const lines = [];
  for (const r of runs) { const last = lines[lines.length-1]; if (last && Math.abs(r.y-last[0].y) <= yTol) last.push(r); else lines.push([r]); }
  return lines.map(l => { l.sort((a,b)=>a.x-b.x); return joinLine(l, median); }).join("\n");
}

const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const c = await (await doc.getPage(i)).getTextContent();
  const text = textFromContent(c.items);
  pages.push({ page: i, text, source: text.replace(/\s/g,"").length >= 8 ? "text" : "empty" });
}

let built = splitIntoSkills(pages).map((raw) => {
  const { content, answers } = splitOffAnswers(raw);
  return { ...formatSkill(content), parts: splitSkillIntoParts(content), answers: answers ? formatText(answers) : null };
});
// Keep only what we're diagnosing, so one run is one skill's worth of API calls.
built = built.filter((s) => s.skill === only && s.test === Number(process.env.TEST || 1));
console.log("analysing:", built.map(s => `Test ${s.test} ${s.skill} (${s.parts.length} parts)`).join(", "));

const result = await analyzeBook("fake-file", built, (p) => console.log(`  progress ${p.done}/${p.total} ${p.label}`));
console.log("\nfailed:", result.failed);
for (const s of result.skills) {
  for (const p of s.parts) {
    const a = p.listening ?? p.reading;
    console.log(`\n### ${s.skill} ${p.label}: ${a ? "analysed" : "NOT ANALYSED"}`);
    if (!a) continue;
    console.log(`  questions: ${a.questions.length} chars, groups: ${a.groups?.length ?? "none"}, imagePages: [${a.imagePages}]`);
    for (const g of a.groups ?? []) {
      console.log(`   - ${g.heading} [${g.type}] items=${g.items.length} body=${g.body.length} options=${g.optionList?.options.length ?? 0} figure=${g.figure ? `page ${g.figure.page} cropped=${g.figure.cropped} ${Math.round(g.figure.image.length/1024)}KB` : "none"}`);
    }
  }
}
