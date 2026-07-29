"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { createTask } from "@/app/(app)/tasks/actions";
import { parseQuickAdd, type QuickAddMatch } from "@/lib/parse-quick-add";
import { combineDateAndTime } from "@/lib/task-dates";
import { cn } from "@/lib/utils";

const PARSE_DEBOUNCE_MS = 150;

// Shared box model between the transparent input and the backdrop it sits
// on, so highlighted spans in the backdrop line up exactly under the text
// rendered by the input. See docs/adr/0002-quick-add-highlighting-technique.md.
const FIELD_CLASSES = "h-8 rounded-lg border px-2.5 py-1 text-base whitespace-pre md:text-sm";

export function TaskQuickAdd({ onCreated }: { onCreated?: () => void }) {
  const [title, setTitle] = useState("");
  const [debouncedTitle, setDebouncedTitle] = useState("");
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedTitle(title), PARSE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [title]);

  const isRejected = useCallback(
    (match: QuickAddMatch) => rejected.has(match.text.toLowerCase()),
    [rejected],
  );

  const parsed = useMemo(
    () => parseQuickAdd(debouncedTitle, undefined, { isRejected }),
    [debouncedTitle, isRejected],
  );

  const segments = useMemo(() => {
    // Only trust the debounced parse's offsets once the title has caught up
    // to it — otherwise a highlight could momentarily land under the wrong
    // word while the user is still mid-keystroke.
    const matches = debouncedTitle === title ? parsed.matches : [];
    const result: { text: string; match: QuickAddMatch | null }[] = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.start > cursor) result.push({ text: title.slice(cursor, match.start), match: null });
      result.push({ text: title.slice(match.start, match.end), match });
      cursor = match.end;
    }
    if (cursor < title.length) result.push({ text: title.slice(cursor), match: null });
    return result;
  }, [title, debouncedTitle, parsed.matches]);

  function reject(match: QuickAddMatch) {
    setRejected((prev) => new Set(prev).add(match.text.toLowerCase()));
  }

  function syncScroll() {
    if (backdropRef.current && inputRef.current) {
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }

  function reset() {
    setTitle("");
    setDebouncedTitle("");
    setRejected(new Set());
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const final = parseQuickAdd(title, undefined, { isRejected });
        const finalTitle = final.strippedTitle || title.trim();
        let dueDate = final.dueDate ?? undefined;
        if (final.startTime) {
          dueDate = combineDateAndTime(dueDate ?? startOfDay(new Date()), final.startTime);
        }
        startTransition(async () => {
          await createTask({
            title: finalTitle,
            dueDate,
            recurrence: final.recurrence ?? undefined,
          });
          reset();
          onCreated?.();
        });
      }}
    >
      <div className="relative h-8 min-w-0 flex-1">
        <div
          ref={backdropRef}
          aria-hidden
          className={cn(
            FIELD_CLASSES,
            "pointer-events-none absolute inset-0 overflow-hidden border-transparent text-transparent",
          )}
        >
          {segments.map((segment, i) =>
            segment.match ? (
              <span
                key={i}
                role="button"
                tabIndex={-1}
                onClick={() => reject(segment.match!)}
                className="relative z-10 cursor-pointer rounded bg-primary/20 pointer-events-auto"
              >
                {segment.text}
              </span>
            ) : (
              <span key={i}>{segment.text}</span>
            ),
          )}
        </div>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onScroll={syncScroll}
          placeholder="Add a task..."
          className={cn(
            FIELD_CLASSES,
            "absolute inset-0 w-full border-input bg-transparent text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        />
      </div>
      <Button type="submit" disabled={isPending}>
        Add
      </Button>
    </form>
  );
}
