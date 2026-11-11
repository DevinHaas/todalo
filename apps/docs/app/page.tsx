import Link from "next/link";
import { SearchTrigger } from "@/components/help-search";
import { Illustration } from "@/components/illustration-slot";
import { Support } from "@/components/support";
import { loadContent } from "@/lib/content";

const suggestions = ["Add a task", "Recurring dates", "Connect the Coach", "Google Calendar"];

export default function HelpHome() {
  const { categories: visibleCategories } = loadContent();
  return <>
    <section className="help-hero">
      <div><p className="eyebrow">A little guidance, a clearer day</p><h1>How can we help?</h1><p>Find your feet, make room for what matters, and get more out of Todalo.</p><SearchTrigger /><div className="suggested-searches"><span>Try:</span>{suggestions.map((query) => <SearchTrigger key={query} query={query} className="search-chip">{query}</SearchTrigger>)}</div></div>
      <Illustration src="/illustrations/hero.webp" priority />
    </section>
    <section className="browse-section" aria-labelledby="browse-title"><div className="section-heading"><h2 id="browse-title">Explore the guides</h2><p>A good place to start, wherever you are.</p></div>
      {visibleCategories.length ? <div className="category-grid">{visibleCategories.map((category) => <Link className="category-card" key={category.slug} href={`/${category.slug}`}><Illustration src={category.illustration} compact /><h3>{category.name}</h3><p>{category.tagline}</p><span className="card-arrow" aria-hidden="true">↗</span></Link>)}</div> : <p className="empty-guides">We’re putting the finishing touches on our guides. In the meantime, we’re happy to help with any questions.</p>}
    </section>
    <Support title="Still need a hand?" />
  </>;
}
