import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "./session";
import { projectReads, searchReads } from "./runtime";
import { searchQuery } from "./search";
import { QuickFindDialog, SearchView, revealHash } from "./search-views";
import { useTaskWrites } from "./task-writes";

/** Mounted only while open, so every opening refetches the user's items (legacy layout data). */
export function QuickFind({ userId, onClose }: { userId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const query = useQuery(searchReads.find(userId));
  return <QuickFindDialog state={query} onRetry={() => void query.refetch()} onClose={onClose}
    onOpen={(href) => { navigate(href); revealHash(href); }} />;
}

/** /search?q= — legacy search page; the query lives in the URL so refresh and links keep it. */
export function SearchScreen({ account }: { account: Account }) {
  const userId = account.user.id;
  const [params, setParams] = useSearchParams();
  const q = searchQuery(params.get("q") ?? "");
  const query = useQuery(searchReads.results(userId, q));
  const projects = useQuery(projectReads.list(userId));
  const names = Object.fromEntries((projects.data ?? []).map(project => [project.id, project.name]));
  const writes = useTaskWrites(userId);
  return <SearchView key={q} query={q} state={query} onRetry={() => void query.refetch()} onSearch={(next) => setParams({ q: next })}
    projectNames={names} actions={writes.actions} writeError={writes.error} />;
}
