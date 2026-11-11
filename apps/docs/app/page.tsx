import Link from "next/link";
import { source } from "@/lib/source";

// Placeholder landing: a plain list of every article. The real landing page
// (search, category cards) replaces this in a later ticket.
export default function Home() {
  return (
    <>
      <h1 className="font-display text-6xl leading-[0.77] font-black tracking-[-0.01em]">
        How can we <span className="font-thin">help?</span>
      </h1>
      <ul className="mt-12 space-y-3">
        {source.getPages().map((page) => (
          <li key={page.url}>
            <Link className="text-brand underline underline-offset-4" href={page.url}>
              {page.data.title}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
