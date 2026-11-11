import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { source } from "@/lib/source";

type Props = { params: Promise<{ category: string; article: string }> };

export default async function ArticlePage({ params }: Props) {
  const { category, article } = await params;
  const page = source.getPage([category, article]);
  if (!page) notFound();
  const Body = page.data.body;
  return (
    <article>
      <h1 className="font-display text-5xl leading-[0.9] font-black tracking-[-0.01em]">{page.data.title}</h1>
      <div className="article mt-10">
        <Body />
      </div>
    </article>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, article } = await params;
  const page = source.getPage([category, article]);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}

// Folder = category, file = article: content/get-started/foo.mdx is /get-started/foo.
export function generateStaticParams() {
  return source.getPages().map((page) => ({ category: page.slugs[0], article: page.slugs[1] }));
}

export const dynamicParams = false;
