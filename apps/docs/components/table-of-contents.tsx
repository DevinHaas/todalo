"use client";

import { useEffect, useState } from "react";

export type Heading = { title: string; url: string };

export function TableOfContents({ headings }: { headings: Heading[] }) {
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

  if (!headings.length) return null;

  const links = (
    <ul className="toc-list">
      {headings.map((heading) => (
        <li key={heading.url}>
          <a href={heading.url} aria-current={active === heading.url ? "location" : undefined}>
            {heading.title}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <nav aria-label="On this page">
      <div className="desktop-toc"><h2 className="sidebar-title">On this page</h2>{links}</div>
      <details className="mobile-toc"><summary>On this page</summary>{links}</details>
    </nav>
  );
}
