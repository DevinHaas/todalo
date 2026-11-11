import Link from "next/link";
import { SearchBar } from "./help-search";
import { Icon } from "./icons";

export type Crumb = { label: string; href?: string };

/** The breadcrumb pill and the full-width search bar at the top of category and article pages. */
export function PageChrome({ trail }: { trail: Crumb[] }) {
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, index) => <li key={crumb.label}>
          {index > 0 && <Icon name="chevron-right" size={12} />}
          {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
        </li>)}
      </ol>
    </nav>
    <SearchBar />
  </>;
}
