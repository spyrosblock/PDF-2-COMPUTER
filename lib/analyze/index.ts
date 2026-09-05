"use client";

// Reading a whole uploaded book's questions out of its extracted text.
//
// lib/pdf takes the PDF apart into tests, skills and parts, but stops at text: it
// splits the book, it does not read it. This is the step that does — the one part
// of the pipeline that leaves the machine, and by far the slowest, since every
// part of every test is several API calls of tens of seconds.
//
// Both examinable skills are analysed: a Reading part becomes a passage and its
// questions (reading.ts), a Listening part becomes its questions and the pictures
// they are answered against (listening.ts). Writing's Task 2 has its task
// description read out of its text (writing.ts) — Task 1 is a chart, already kept
// as a page image — and Speaking is out of scope. Alongside the parts, each of
// the examinable skills' printed answer key is read into the answers themselves
// (answers.ts), which is what lets a finished paper be marked.
//
// A unit whose analysis fails is left with the text it was read from and nothing
// else — one bad part must not cost the student the book, and a key that couldn't
// be read costs them the marking, not the test.

import type { QuestionSkill } from "@/lib/claude/shared";
import type { Part, Skill, TestSkill } from "@/lib/pdf";
import type { AnswerKey } from "@/lib/questions";
import { readAnswerKey } from "./answers";
import { analyzeListeningPart } from "./listening";
import { analyzeReadingPart } from "./reading";
import { analyzeWritingPart } from "./writing";
import { lazyRenderer, mapPool, type RenderPage } from "./shared";

// How many parts to analyse at once. Each part is several API calls of tens of
// seconds, and a book holds 12 reading parts and 16 listening ones, so
// serialising them would take far too long; more than a handful in flight just
// risks upstream rate limits.
const CONCURRENCY = 3;

export type AnalysisProgress = {
  done: number;
  total: number;
  label: string; // what just finished, e.g. "Test 2 · Reading Passage 1"
};

export type Analysis = {
  skills: TestSkill[];
  failed: string[]; // labels of the parts (and keys) whose analysis failed
};

// The skills whose parts carry questions, and how a part of one is read. Each
// hands back the fields it fills in, so a part is finished by merging them in and
// the two skills' results never have to be told apart again.
type Analyse = (part: Part, image: RenderPage) => Promise<Partial<Part>>;

const ANALYSED: Partial<Record<Skill, Analyse>> = {
  Reading: async (part, image) => ({
    reading: await analyzeReadingPart(part, image),
  }),
  Listening: async (part, image) => ({
    listening: await analyzeListeningPart(part, image),
  }),
  Writing: async (part) => ({
    writing: (await analyzeWritingPart(part)).writing,
  }),
};

type Target = {
  key: string; // "2:Reading:1"
  label: string; // "Test 2 · Reading Passage 1"
  skill: Skill;
  part: Part;
};

function targets(skills: TestSkill[]): Target[] {
  return skills.flatMap((skill) =>
    skill.skill && skill.skill in ANALYSED
      ? skill.parts.map((part) => ({
          key: `${skill.test}:${skill.skill}:${part.index}`,
          label: `Test ${skill.test} · ${part.label}`,
          skill: skill.skill as Skill,
          part,
        }))
      : [],
  );
}

// The other kind of unit: a skill's printed answer key, read into the answers
// themselves so the paper can be marked (lib/analyze/answers.ts). One per skill
// rather than one per part — the books print all 40 answers on one page — and
// only for the skills whose parts are analysed at all, since a Writing task has
// no key to read.
type KeyTarget = {
  key: string; // "2:Reading"
  label: string; // "Test 2 · Reading answers"
  skill: QuestionSkill;
  text: string;
};

function keyTargets(skills: TestSkill[]): KeyTarget[] {
  return skills.flatMap((skill) =>
    skill.answers && skill.skill && skill.skill in ANALYSED
      ? [
          {
            key: `${skill.test}:${skill.skill}`,
            label: `Test ${skill.test} · ${skill.skill} answers`,
            skill: skill.skill as QuestionSkill,
            text: skill.answers,
          },
        ]
      : [],
  );
}

// One unit of work, whichever kind it is: everything the pool below needs to run
// it, name it in the progress line, and name it again if it fails.
type Job = { label: string; run: () => Promise<void> };

// Analyse every reading and listening part in the book — and every answer key it
// printed — and return the skills with each part and key filled in, alongside the
// labels of whatever failed. Skills with no questions to read (and books with none
// at all) pass straight through, and the PDF is only re-opened if some part needs
// a page image.
//
// Parts and keys share one pool: a key is a single quick call where a part is
// several slow ones, so queueing them together costs nothing and keeps the
// progress line honest about how much of the book is left.
export async function analyzeBook(
  file: File,
  skills: TestSkill[],
  onProgress?: (p: AnalysisProgress) => void,
): Promise<Analysis> {
  const partTargets = targets(skills);
  const answerTargets = keyTargets(skills);
  if (partTargets.length + answerTargets.length === 0) {
    return { skills, failed: [] };
  }

  const renderer = lazyRenderer(file);
  const parts = new Map<string, Partial<Part>>();
  const keys = new Map<string, AnswerKey>();

  const jobs: Job[] = [
    ...partTargets.map((target) => ({
      label: target.label,
      run: async () => {
        const analyse = ANALYSED[target.skill]!;
        parts.set(target.key, await analyse(target.part, renderer.image));
      },
    })),
    ...answerTargets.map((target) => ({
      label: target.label,
      run: async () => {
        keys.set(target.key, await readAnswerKey(target.text, target.skill));
      },
    })),
  ];

  const failed: string[] = [];
  let finished = 0;
  onProgress?.({ done: 0, total: jobs.length, label: "" });

  try {
    await mapPool(jobs, CONCURRENCY, async (job) => {
      try {
        await job.run();
      } catch (err) {
        console.error(`Analysis failed for ${job.label}:`, err);
        failed.push(job.label);
      }
      onProgress?.({ done: ++finished, total: jobs.length, label: job.label });
    });
  } finally {
    await renderer.close();
  }

  return {
    skills: skills.map((skill) => {
      if (!skill.skill || !(skill.skill in ANALYSED)) return skill;
      const key = keys.get(`${skill.test}:${skill.skill}`);
      return {
        ...skill,
        parts: skill.parts.map((part) => ({
          ...part,
          ...parts.get(`${skill.test}:${skill.skill}:${part.index}`),
        })),
        ...(key && key.length > 0 ? { answerKey: key } : {}),
      };
    }),
    failed,
  };
}
