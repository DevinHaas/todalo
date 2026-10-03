"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { createTask } from "@/app/(app)/tasks/actions";
import { parseQuickAddOrPlain, type QuickAddMatch } from "@/lib/parse-quick-add";
import { combineDateAndTime } from "@/lib/task-dates";
import { cn } from "@/lib/utils";
import { useSmartDateRecognition } from "@/components/settings/smart-date-recognition";

// Shared box model between the transparent input and the backdrop it sits
// on, so highlighted spans in the backdrop line up exactly under the text
// rendered by the input. See docs/adr/0002-quick-add-highlighting-technique.md.
const FIELD_CLASSES = "h-8 rounded-lg border px-2.5 py-1 text-base whitespace-pre md:text-sm";

export function TaskQuickAdd({ onCreated }: { onCreated?: () => void }) {
  const { enabled: smartDateRecognitionEnabled } = useSmartDateRecognition();
  const [title, setTitle] = useState("");
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const isRejected = useCallback(
    (match: QuickAddMatch) => rejected.has(match.text.toLowerCase()),
    [rejected],
  );

  const parsed = useMemo(
    () => parseQuickAddOrPlain(title, smartDateRecognitionEnabled, undefined, { isRejected }),
    [title, smartDateRecognitionEnabled, isRejected],
  );

  const segments = useMemo(() => {
    // A match still touching the end of the title is the word currently
    // being typed — its boundaries are still moving, so leave it plain
    // until a following character (typically a space) closes it off.
    // Otherwise it'd restyle on every keystroke, which reads as blinking.
    const matches = parsed.matches.filter((m) => m.end < title.length);
    const result: { text: string; match: QuickAddMatch | null }[] = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.start > cursor) result.push({ text: title.slice(cursor, match.start), match: null });
      result.push({ text: title.slice(match.start, match.end), match });
      cursor = match.end;
    }
    if (cursor < title.length) result.push({ text: title.slice(cursor), match: null });
    return result;
  }, [title, parsed.matches]);

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
    setRejected(new Set());
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const final = parseQuickAddOrPlain(title, smartDateRecognitionEnabled, undefined, { isRejected });
        const finalTitle = final.strippedTitle || title.trim();
        const baseDate = final.dueDate ?? startOfDay(new Date());
        const dueDate = final.startTime ? combineDateAndTime(baseDate, final.startTime) : final.dueDate ?? undefined;
        const dueDateEnd =
          final.startTime && final.endTime ? combineDateAndTime(baseDate, final.endTime) : undefined;
        startTransition(async () => {
          await createTask({
            title: finalTitle,
            dueDate,
            dueDateEnd,
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
                className="relative z-10 inline-flex items-center cursor-pointer rounded px-px py-0.5 -mx-px bg-destructive/20 pointer-events-auto"
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
