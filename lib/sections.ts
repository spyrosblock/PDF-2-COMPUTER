// The test sections and how they map to URL slugs. Each section now lives on its
// own page (/tests/<book>/<test>/<section>), so both the test hub and the section
// pages share this list and the slug <-> Section conversion from here.

import type { Section } from "./pdf";

// Sections a student can take, in the order the books print them. Speaking is
// split out of the book too (see lib/pdf) but is intentionally not offered as a
// timed section here.
export const OFFERED_SECTIONS: Section[] = ["Listening", "Reading", "Writing"];

// URLs are lowercase ("reading"); the stored data and UI use the capitalised
// Section ("Reading").
export function sectionToSlug(section: Section): string {
  return section.toLowerCase();
}

// Resolve a URL slug back to a known Section, or null if it isn't one we offer.
export function slugToSection(slug: string): Section | null {
  return (
    OFFERED_SECTIONS.find((s) => s.toLowerCase() === slug.toLowerCase()) ?? null
  );
}
