import type { Metadata } from "next";
import { isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { content, source } from "@/lib/content";
import { Callout, Steps, Step, Tip, Note, Warning } from "@/components/article-components";
import { PlatformContent } from "@/components/platform-content";
import { Shortcut } from "@/components/keyboard-shortcut";
import { ThemedScreenshot } from "@/components/themed-screenshot";
import { ReleaseNotes, ShortcutTable } from "@/components/generated-content";
import { TableOfContents } from "@/components/table-of-contents";
import { Support } from "@/components/support";
import { PageChrome } from "@/components/page-chrome";
import { Icon } from "@/components/icons";
import { PLATFORM_LABELS } from "@/lib/platform";

type Props = { params: Promise<{ category: string; article: string }> };
const components = { Callout, Steps, Step, Tip, Note, Warning, Platform: PlatformContent, Shortcut, Kbd: Shortcut, ThemedScreenshot, ShortcutTable, ReleaseNotes };
const AUTHOR = "Devin";

/** Plain text of a heading title (Fumadocs gives JSX when the heading has formatting). */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : "";
}

function getArticle(category: string, slug: string) {
  const article = content.article(`/${category}/${slug}`);
  const page = source.getPage([category, slug]);
  if (!article || !page) notFound();
  return { article, page };
}

export default async function ArticlePage({ params }: Props) {
  const route = await params;
  const { article, page } = getArticle(route.category, route.article);
  const category = content.category(article.category)!;
  const Body = page.data.body;
  const headings = [
    { title: "Overview", url: "#overview" },
    ...page.data.toc.filter((heading) => heading.depth === 2).map((heading) => ({ title: textOf(heading.title), url: heading.url })),
  ];
  const related = article.related.flatMap((url) => content.article(url) ?? []);
  return <>
    <PageChrome trail={[{ label: "Help Center", href: "/" }, { label: category.name, href: `/${category.slug}` }]} />
    <header className="article-title"><h1>{article.title}</h1></header>
    <div className="article-layout">
      <aside className="article-sidebar" aria-label="Article details">
        {article.badge === "experiment" && <section><h2 className="sidebar-title">Status</h2><ul className="chips"><li className="chip chip-experiment">Experiment</li></ul></section>}
        <section><h2 className="sidebar-title">Platforms</h2><ul className="chips">{article.platforms.map((platform) => <li key={platform} className="chip">{PLATFORM_LABELS[platform]}</li>)}</ul></section>
        <TableOfContents headings={headings} />
        {related.length > 0 && <section className="sidebar-after"><h2 className="sidebar-title">Related articles</h2><ul className="related-links">{related.map((entry) => <li key={entry.url}><Link href={entry.url}><Icon name="article" />{entry.title}</Link></li>)}</ul></section>}
        <section className="sidebar-after"><h2 className="sidebar-title">Last updated by</h2><div className="author">{/* eslint-disable-next-line @next/next/no-img-element -- tiny static avatar */}
          <img className="avatar" src="/devin.webp" alt="" width={36} height={36} /><div><p>{AUTHOR}</p>{article.updatedAt ? <time dateTime={article.updatedAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(article.updatedAt))}</time> : <p>Awaiting first review</p>}</div></div></section>
      </aside>
      <article className="article-content"><div className="article" id="overview"><Body components={components} /></div><Support /></article>
    </div>
  </>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const route = await params;
  const { article } = getArticle(route.category, route.article);
  return { title: article.title, description: article.description, alternates: { canonical: article.url }, robots: article.published ? undefined : { index: false, follow: false }, openGraph: { title: article.title, description: article.description, url: article.url, images: ["/og.jpg"] } };
}

// Folder = category, file = article: content/get-started/foo.mdx is /get-started/foo.
export function generateStaticParams() {
  return content.articles.map((article) => ({ category: article.category, article: article.slug }));
}

export const dynamicParams = false;
