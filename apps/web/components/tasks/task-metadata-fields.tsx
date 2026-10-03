"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { getMetadata } from "@/app/(app)/tasks/metadata-actions";
import { ShortcutHint } from "@/components/keyboard/keyboard-provider";

export function useMetadataOptions(enabled: boolean) {
  const [options, setOptions] = useState<Awaited<ReturnType<typeof getMetadata>> | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function reload() { startTransition(async () => { try { setError(""); setOptions(await getMetadata()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Labels could not load"); } }); }
  useEffect(() => { if (enabled) reload(); }, [enabled]);
  return { options, error, pending, reload };
}
export function dateInputValue(date: Date | string | null | undefined) {
  if (!date) return "";
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function dateInputDate(value: string) { return value ? new Date(`${value}T00:00:00`) : null; }
export function TaskMetadataFields({ priority, onPriority, deadline, onDeadline, labelIds, onLabels, labels, focusField, onlyField, disabled = false }: {
  priority: number; onPriority(value: number): void; deadline: string; onDeadline(value: string): void;
  labelIds: string[]; onLabels(value: string[]): void; labels: { id: string; name: string }[];
  focusField?: "priority" | "labels" | "deadline"; disabled?: boolean;
  onlyField?: "priority" | "labels" | "deadline";
}) {
  const scope = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focusField) scope.current?.querySelector<HTMLElement>(`[data-metadata-field="${focusField}"]`)?.focus(); }, [focusField]);
  return <div ref={scope} className="space-y-3">
    {(!onlyField || onlyField === "priority") && <label className="block space-y-1"><span>Priority <ShortcutHint commandId="task.priority" /></span><select data-metadata-field="priority" aria-label="Priority" className="w-full rounded border bg-background p-2" disabled={disabled} value={priority} onChange={event => onPriority(Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>Priority {value}{value === 1 ? " — highest" : value === 4 ? " — normal" : ""}</option>)}</select></label>}
    {(!onlyField || onlyField === "deadline") && <><label className="block space-y-1"><span>Deadline <ShortcutHint commandId="task.deadline" /></span><input data-metadata-field="deadline" aria-label="Deadline" type="date" className="w-full rounded border bg-background p-2" value={deadline} disabled={disabled} onChange={event => onDeadline(event.target.value)} /></label>
    <button type="button" disabled={disabled || !deadline} className="text-sm underline disabled:opacity-50" onClick={() => onDeadline("")}>Clear deadline <ShortcutHint commandId="task.clear-deadline" /></button></>}
    {(!onlyField || onlyField === "labels") && <fieldset disabled={disabled} className="space-y-2"><legend>Labels <ShortcutHint commandId="task.labels" /></legend><div data-metadata-field="labels" tabIndex={-1} className="flex flex-wrap gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">{labels.map(label => <label key={label.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={labelIds.includes(label.id)} onChange={event => onLabels(event.target.checked ? [...labelIds, label.id] : labelIds.filter(id => id !== label.id))} />{label.name}</label>)}</div>{!labels.length && <p className="text-sm text-muted-foreground">Create labels in <Link href="/labels" className="underline">Labels</Link>.</p>}</fieldset>}
  </div>;
}
