"use client";

import { useSearchParams } from "next/navigation";

// Debugging aids across the app are gated behind a `debug` query param, so a
// plain `?debug` (or `?debug=1`) on any page opts into the extra content while
// students never see it. Components calling this must sit under a <Suspense>
// boundary — useSearchParams forces client rendering of everything up to it.
export function useDebug(): boolean {
  return useSearchParams().has("debug");
}
