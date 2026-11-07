import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { TaskDto } from "./tasks";
import { Failure, type ReadState } from "./views";
import { CollectionBody, type CollectionSlots } from "./metadata-views";
import { matchFindItems, type FindItem, type SearchDto } from "./search";
import { releaseFocus } from "./software-keyboard";

/**
 * Legacy Quick Find (organization-navigation.tsx): title-only matches over the
 * user's tasks, projects and sections, at most 40, plus "View all search results".
 */
export function QuickFindDialog({ state, onRetry, sectionsOnly = false, onOpen, onClose }: {
  state: ReadState<{ items: FindItem[] }>; onRetry: () => void; sectionsOnly?: boolean;
  onOpen: (href: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = matchFindItems(state.data?.items ?? [], query, sectionsOnly);
  const go = (href: string) => { onClose(); onOpen(href); };
  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="quick-find-title" className="dialog quick-find" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <h2 id="quick-find-title" className="dialog-title">{sectionsOnly ? "Navigate sections" : "Quick Find"}</h2>
      <input ref={releaseFocus} autoFocus aria-label="Search tasks, projects and sections" placeholder="Search tasks, projects and sections" value={query}
        onChange={(event) => setQuery(event.target.value)} />
      <div className="find-results" aria-live="polite">
        {state.status === "pending" ? <p className="state" role="status">Loading…</p>
          : state.status === "error" && !state.data ? <Failure error={state.error} onRetry={onRetry} />
          : <>
            {results.map(item => <a key={`${item.kind}-${item.id}`} className="find-result" href={item.href}
              onClick={(event) => { event.preventDefault(); go(item.href); }}><span>{item.title}</span><span className="find-kind">{item.kind}</span></a>)}
            {!results.length && <p className="state">No results.</p>}
          </>}
      </div>
      <a className="text-action find-all" href={`/search?q=${encodeURIComponent(query)}`}
        onClick={(event) => { event.preventDefault(); go(`/search?q=${encodeURIComponent(query)}`); }}>View all search results</a>
    </div>
  </div>;
}

/** Legacy /search page: the query form, the result count and the matching tasks. */
export function SearchView({ query, state, onSearch, onRetry, ...slots }: CollectionSlots & {
  query: string; state: ReadState<SearchDto>; onSearch: (query: string) => void; onRetry: () => void;
}) {
  const [draft, setDraft] = useState(query);
  const submit = (event: FormEvent) => { event.preventDefault(); onSearch(draft); };
  const tasks: TaskDto[] = state.data?.tasks ?? [];
  return <div className="collection">
    <div className="project-header"><h1 className="page-title">Search</h1>{state.data && !slots.layout && slots.selection?.control}</div>
    <form className="search-form" role="search" onSubmit={submit}>
      <input aria-label="Search tasks" name="q" placeholder="Search tasks" enterKeyHint="search" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="submit" className="button outline">Search</button>
    </form>
    {state.status === "pending" ? <p className="state" role="status">Loading tasks…</p>
      : state.status === "error" && !state.data ? <Failure error={state.error} onRetry={onRetry} />
      : <>
        <p className="state" role="status">{tasks.length} results</p>
        {state.status === "error" && <Failure error={state.error} onRetry={onRetry} />}
        <CollectionBody tasks={tasks} {...slots} />
      </>}
  </div>;
}

/** Focuses (and so scrolls to) a Quick Find section target once the project renders it. */
export function revealHash(href: string, doc: Document = document, until = Date.now() + 3000) {
  const id = href.split("#")[1];
  if (!id) return;
  const target = doc.getElementById(id);
  if (target) { target.focus(); return; }
  if (Date.now() < until) setTimeout(() => revealHash(href, doc, until), 50);
}
