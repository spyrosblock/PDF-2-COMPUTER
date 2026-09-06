// The test skills and their URL slug mapping (/tests/<book>/<test>/<skill>),
// shared by the test hub and the skill pages.

import type { Skill } from "./pdf";

// Skills a student can take, in book order. Speaking is extracted too but
// intentionally not offered as a timed skill.
export const OFFERED_SKILLS: Skill[] = ["Listening", "Reading", "Writing"];

// URLs are lowercase ("reading"); the stored data and UI use the capitalised
// Skill ("Reading").
export function skillToSlug(skill: Skill): string {
  return skill.toLowerCase();
}

// Resolve a URL slug back to a known Skill, or null if it isn't one we offer.
export function slugToSkill(slug: string): Skill | null {
  return (
    OFFERED_SKILLS.find((s) => s.toLowerCase() === slug.toLowerCase()) ?? null
  );
}
