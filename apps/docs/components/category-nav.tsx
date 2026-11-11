"use client";

import Link from "next/link";
import { Icon } from "./icons";
import { SideLinks, useActiveHeading, type Heading } from "./table-of-contents";

/**
 * Every visible category as an accordion row. The current one is open and lists
 * its sections (tracked like a table of contents); the others link to their page.
 */
export function CategoryNav({ categories, current, sections }: {
  categories: { slug: string; name: string }[];
  current: string;
  sections: Heading[];
}) {
  const active = useActiveHeading(sections);
  const currentName = categories.find((category) => category.slug === current)?.name ?? "Categories";
  return (
    <nav className="category-nav" aria-label="Categories">
      {/* Phones and tablets: one closed row naming the current category; opening it lists the others. */}
      <details className="mobile-categories">
        <summary className="category-nav-row">{currentName}<Icon name="chevron-down" /></summary>
        <ul>{categories.filter((category) => category.slug !== current).map((category) => <li key={category.slug}><Link className="category-nav-row" href={`/${category.slug}`}>{category.name}</Link></li>)}</ul>
      </details>
      <ul className="desktop-categories">
        {categories.map((category) => <li key={category.slug}>
          {category.slug === current
            ? <details open>
              <summary className="category-nav-row">{category.name}<Icon name="chevron-down" /></summary>
              <SideLinks links={sections} active={active} />
            </details>
            : <Link className="category-nav-row" href={`/${category.slug}`}>{category.name}<Icon name="chevron-down" /></Link>}
        </li>)}
      </ul>
    </nav>
  );
}
