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
  return (
    <nav className="category-nav" aria-label="Categories">
      <ul>
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
