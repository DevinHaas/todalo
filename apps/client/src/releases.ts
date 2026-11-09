import { version } from "../package.json";

/**
 * Release notes shown in What's new and the Changelog (docs/releasing.md).
 * Newest first; releases.test.ts fails when the first entry's version is not
 * package.json's, so a release can't ship without its notes.
 */
export interface Release { version: string; date: string; title?: string; highlights: string[]; changes?: string[] }

export const releases: Release[] = [
  {
    version: "0.1.0",
    date: "2026-11-09",
    title: "The first todalo",
    highlights: [
      "Tasks and projects, with sections, labels, filters and sub-tasks.",
      "A calendar that shows your Google Calendar next to your tasks.",
      "Ramble: say what's on your mind and get tasks back.",
      "Goals and seasons to steer what you work on.",
      "The AI Coach drafts your day and week, right from the Coach bar.",
      "Rituals for a daily check-in and weekly and season reviews.",
      "Now, Next and Later for tasks without a time.",
    ],
  },
];

/** Experimental features listed under Latest experiments. No flags: they are simply on. */
export const experiments: { title: string; description: string }[] = [
  { title: "AI Coach", description: "Drafts for your day and week, the Coach bar for quick questions, and documents you can attach for context." },
];

export const appVersion: string = version;

/** Compares dotted numeric versions: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: string, b: string) {
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** What's new opens once after an update; a first-ever run (nothing seen yet) stays quiet. */
export const showWhatsNew = (current: string, lastSeen: string | null) => lastSeen !== null && compareVersions(current, lastSeen) > 0;

export const lastSeenKey = (userId: string) => `todalo-last-seen-version:${userId}`;
