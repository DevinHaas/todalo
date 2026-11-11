import Link from "next/link";
import { SearchBar } from "@/components/help-search";

export default function NotFound() {
  return <section className="not-found"><p className="eyebrow">404 · A little off track</p><h1>Let’s find your way.</h1><p>This guide may have moved, or isn’t available yet.</p><SearchBar /><Link className="text-link" href="/">Back to the help center</Link></section>;
}
