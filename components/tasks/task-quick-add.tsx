"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createTask } from "@/app/(app)/tasks/actions";

export function TaskQuickAdd({ onCreated }: { onCreated?: () => void }) {
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        startTransition(async () => {
          await createTask({ title });
          setTitle("");
          onCreated?.();
        });
      }}
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task..."
      />
      <Button type="submit" disabled={isPending}>
        Add
      </Button>
    </form>
  );
}
