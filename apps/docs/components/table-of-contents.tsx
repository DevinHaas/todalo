"use client";

import { useEffect, useState } from "react";

export type Heading = { title: string; url: string };

/** The `#anchor` of the last heading scrolled past (the first one at the top of the page). */
export function useActiveHeading(headings: Heading[]) {
  const [active, setActive] = useState(headings[0]?.url);

  useEffect(() => {
    function update() {
      let current = headings[0]?.url;
      for (const heading of headings) {
        const element = document.getElementById(decodeURIComponent(heading.url.slice(1)));
        if (element && element.getBoundingClientRect().top <= 160) current = heading.url;
      }
      setActive(current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [headings]);

  return active;
}

/** Sidebar links with the red bar on the current one. */
export function SideLinks({ links, active }: { links: Heading[]; active?: string }) {
  return (
    <ul className="side-links">
      {links.map((link) => (
        <li key={link.url}>
          <a href={link.url} aria-current={active === link.url ? "location" : undefined}>{link.title}</a>
        </li>
      ))}
    </ul>
  );
}

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const active = useActiveHeading(headings);
  if (!headings.length) return null;
  const links = <SideLinks links={headings} active={active} />;
  return (
    <nav aria-label="On this page" className="toc">
      <div className="desktop-toc"><h2 className="sidebar-title">Table of Contents</h2>{links}</div>
      <details className="mobile-toc"><summary>On this page</summary>{links}</details>
    </nav>
  );
}
