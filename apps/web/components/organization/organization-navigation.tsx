"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useKeyboardCommands } from "@/components/keyboard/keyboard-provider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { matchFindItems, type FindItem } from "@todalo/server/search";

export type { FindItem };

export function OrganizationNavigation({ items }: { items: FindItem[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"find" | "sections" | null>(null);
  const [query, setQuery] = useState("");
  const results = matchFindItems(items, query, mode === "sections");
  const show = (next: "find" | "sections") => { setQuery(""); setMode(next); };
  useKeyboardCommands({
    "navigation.inbox": () => router.push("/inbox"),
    "navigation.projects": () => router.push("/projects"),
    "navigation.labels": () => router.push("/labels"),
    "navigation.filters": () => router.push("/filters"),
    "navigation.sections": () => show("sections"),
    "general.search": () => show("find"),
    "general.quick-find": () => show("find"),
  });
  return <>
    <button type="button" data-quick-find onClick={() => show("find")} className="sr-only">Quick Find</button>
    <Dialog open={mode !== null} onOpenChange={open => { if (!open) setMode(null); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{mode === "sections" ? "Navigate sections" : "Quick Find"}</DialogTitle></DialogHeader>
        <Input aria-label="Search tasks, projects and sections" placeholder="Search tasks, projects and sections" value={query} onChange={event => setQuery(event.target.value)} />
        <div className="max-h-80 space-y-1 overflow-y-auto" aria-live="polite">
          {results.map(item => <Link key={`${item.kind}-${item.id}`} className="flex justify-between gap-3 rounded p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" href={item.href} onClick={() => setMode(null)}><span>{item.title}</span><span className="text-xs text-muted-foreground">{item.kind}</span></Link>)}
          {!results.length && <p className="p-2 text-muted-foreground">No results.</p>}
        </div>
        <Link href={`/search?q=${encodeURIComponent(query)}`} onClick={() => setMode(null)} className="text-sm underline">View all search results</Link>
      </DialogContent>
    </Dialog>
  </>;
}
