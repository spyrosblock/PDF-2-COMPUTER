// The test skills and how they map to URL slugs. Each skill lives on its own
// page (/tests/<book>/<test>/<skill>), so both the test hub and the skill pages
// share this list and the slug <-> Skill conversion from here.

import type { Skill } from "./pdf";

// Skills a student can take, in the order the books print them. Speaking is
// split out of the book too (see lib/pdf) but is intentionally not offered as a
// timed skill here.
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
