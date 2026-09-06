"use client";

// Reading a whole uploaded book's questions out of its extracted text — the
// only pipeline step that leaves the machine, and the slowest. Reading parts
// become passage + questions (reading.ts), listening parts questions + pictures
// (listening.ts), writing Task 2 its description (writing.ts), and each skill's
// key its markable answers (answers.ts). A failed unit keeps its text; one bad
// part must not cost the student the book.

import type { QuestionSkill } from "@/lib/claude/shared";
import type { Part, Skill, TestSkill } from "@/lib/pdf";
import type { AnswerKey } from "@/lib/questions";
import { readAnswerKey } from "./answers";
import { analyzeListeningPart } from "./listening";
import { analyzeReadingPart } from "./reading";
import { analyzeWritingPart } from "./writing";
import { lazyRenderer, mapPool, type RenderPage } from "./shared";

// How many parts to analyse at once; serialising would take far too long.
// Jobs run independently, so a quick key never waits on a slow part.
const CONCURRENCY = 10;

export type AnalysisProgress = {
  done: number;
  total: number;
  label: string; // what just finished, e.g. "Test 2 · Reading Passage 1"
};

export type Analysis = {
  skills: TestSkill[];
  failed: string[]; // labels of the parts (and keys) whose analysis failed
  elapsedMs: number; // total wall-clock time the AI parsing took
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

// The other unit: a skill's answer key (one per skill, not per part), for the
// skills whose parts are analysed.
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

// Analyse every part and answer key in the book and return the skills with
// each filled in, plus the labels of whatever failed. Parts and keys share one
// pool, keeping the progress line honest.
export async function analyzeBook(
  file: File,
  skills: TestSkill[],
  onProgress?: (p: AnalysisProgress) => void,
): Promise<Analysis> {
  const partTargets = targets(skills);
  const answerTargets = keyTargets(skills);
  if (partTargets.length + answerTargets.length === 0) {
    return { skills, failed: [], elapsedMs: 0 };
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
  const startedAt = performance.now();
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

  const elapsedMs = performance.now() - startedAt;
  return {
    elapsedMs,
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
