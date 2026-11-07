import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "./session";
import { searchReads } from "./runtime";
import { searchQuery } from "./search";
import { QuickFindDialog, SearchView, revealHash } from "./search-views";
import { useCollection } from "./metadata-screens";

/** Mounted only while open, so every opening refetches the user's items (legacy layout data). */
export function QuickFind({ userId, sectionsOnly, onClose }: { userId: string; sectionsOnly?: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const query = useQuery(searchReads.find(userId));
  return <QuickFindDialog sectionsOnly={sectionsOnly} state={query} onRetry={() => void query.refetch()} onClose={onClose}
    onOpen={(href) => { navigate(href); revealHash(href); }} />;
}

/** /search?q= — legacy search page; the query lives in the URL so refresh and links keep it. */
export function SearchScreen({ account }: { account: Account }) {
  const userId = account.user.id;
  const [params, setParams] = useSearchParams();
  const q = searchQuery(params.get("q") ?? "");
  const query = useQuery(searchReads.results(userId, q));
  const { slots } = useCollection(account, query.data?.tasks ?? []);
  return <SearchView key={q} query={q} state={query} onRetry={() => void query.refetch()} onSearch={(next) => setParams({ q: next })} {...slots} />;
}
