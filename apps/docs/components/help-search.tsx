"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useStaticSearch } from "fumadocs-core/search/client";
import posthog from "posthog-js";
import { Icon } from "./icons";

export type SearchArticle = { url: string; title: string; description: string; category: string };
const SearchContext = createContext<(query?: string) => void>(() => {});

export function HelpSearchProvider({ articles, children }: { articles: SearchArticle[]; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lastTracked = useRef("");
  const { search, onSearchChange, data, isLoading, error } = useStaticSearch({ from: "/api/search" });
  const results = data?.items.filter((item) => item.type !== "table") ?? [];

  useEffect(() => {
    if (!data || isLoading || data.query !== search || !search.trim()) return;
    const timeout = window.setTimeout(() => {
      if (lastTracked.current === data.query || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
      lastTracked.current = data.query;
      posthog.capture("help_search", { query: data.query, result_count: data.items.length, site: "help" });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [data, isLoading, search]);

  function openSearch(query = "") {
    onSearchChange(query);
    dialog.current?.showModal();
    input.current?.focus();
  }

  return (
    <SearchContext.Provider value={openSearch}>
      {children}
      <dialog ref={dialog} className="search-dialog" aria-labelledby="search-title" onClick={(event) => {
        if (event.target === dialog.current) dialog.current.close();
      }}>
        <div className="search-panel">
          <div className="search-heading"><h2 id="search-title">Search Todalo Help</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="Close search">Close <kbd>Esc</kbd></button></div>
          <label htmlFor="help-search" className="sr-only">What do you need help with?</label>
          <input ref={input} id="help-search" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Try Quick Add, projects, or Calendar…" autoComplete="off" />
          <div className="search-results" aria-live="polite" aria-busy={isLoading}>
            {error ? <p>Search couldn’t load. Try again, or <a className="text-link" href="mailto:support@todalo.app">email support</a>.</p> : isLoading ? <p>Searching…</p> : !search.trim() ? <p>Search for a feature, a question, or something you want to do.</p> : results.length === 0 ? <p>No results for “{search}”. Try a shorter phrase, or <a className="text-link" href="mailto:support@todalo.app">ask us for a hand</a>.</p> : (
              <ul>{results.map((result) => {
                const article = articles.find((entry) => entry.url === result.url.split("#")[0]);
                return <li key={result.id}><Link href={result.url} onClick={() => dialog.current?.close()}><span className="eyebrow">{article?.category}</span><strong>{article?.title ?? result.content}</strong><span>{article?.description ?? result.content}</span></Link></li>;
              })}</ul>
            )}
          </div>
        </div>
      </dialog>
    </SearchContext.Provider>
  );
}

export function SearchTrigger({ query, children, className = "search-trigger" }: { query?: string; children?: ReactNode; className?: string }) {
  const openSearch = useContext(SearchContext);
  return <button type="button" className={className} onClick={() => openSearch(query)}>{children ?? <><span aria-hidden="true">⌕</span> Search help <span aria-hidden="true">↗</span></>}</button>;
}

/** The full-width search field at the top of pages; opens the search dialog. */
export function SearchBar() {
  return (
    <SearchTrigger className="search-bar">
      <Icon name="search" size={20} /><span>Search</span><span className="sr-only"> help</span>
      <span className="search-bar-go" aria-hidden="true"><Icon name="arrow-right" /></span>
    </SearchTrigger>
  );
}
