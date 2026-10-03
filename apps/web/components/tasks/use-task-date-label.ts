"use client";
import { useSyncExternalStore } from "react";
import { taskDateLabel } from "@/lib/task-date-label";

const subscribe = () => () => {};
// The initial browser snapshot matches SSR. After hydration use the user's
// zone so a chosen local calendar date never shifts to its UTC predecessor.
export function useTaskDateLabel(value: Date | string | null | undefined) {
  return useSyncExternalStore(subscribe,
    () => value ? taskDateLabel(value, Intl.DateTimeFormat().resolvedOptions().timeZone) : "",
    () => value ? taskDateLabel(value) : "");
}
