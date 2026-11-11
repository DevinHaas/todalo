import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { content, source } from "@/lib/content";
import { Callout, Steps, Step, Tip, Note, Warning } from "@/components/article-components";
import { PlatformContent } from "@/components/platform-content";
import { PlatformSwitcher } from "@/components/platform-switcher";
import { Shortcut } from "@/components/keyboard-shortcut";
import { ThemedScreenshot } from "@/components/themed-screenshot";
import { ReleaseNotes, ShortcutTable } from "@/components/generated-content";
import { TableOfContents } from "@/components/table-of-contents";
import { Support } from "@/components/support";
import { PLATFORM_LABELS, needsPlatformSwitcher } from "@/lib/platform";

type Props = { params: Promise<{ category: string; article: string }> };
const components = { Callout, Steps, Step, Tip, Note, Warning, Platform: PlatformContent, Shortcut, Kbd: Shortcut, ThemedScreenshot, ShortcutTable, ReleaseNotes };

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
  const headings = page.data.toc.filter((heading) => heading.depth === 2).map((heading) => ({ title: typeof heading.title === "string" ? heading.title : heading.url.slice(1).replaceAll("-", " "), url: heading.url }));
  const related = article.related.flatMap((url) => content.article(url) ?? []);
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Help center</Link><span aria-hidden="true">/</span><Link href={`/${category.slug}`}>{category.name}</Link><span aria-hidden="true">/</span><span aria-current="page">{article.title}</span></nav>
    <div className="article-layout">
      <article><header className="article-header">{article.badge === "experiment" && <span className="experiment-badge">Experiment</span>}<h1>{article.title}</h1><PlatformSwitcher hasPlatformContent={needsPlatformSwitcher(article.body)} /></header><div className="mobile-article-toc"><TableOfContents headings={headings} /></div><div className="article"><Body components={components} /></div><Support /></article>
      <aside className="article-sidebar" aria-label="Article details"><section><h2 className="sidebar-title">Available on</h2><p>{article.platforms.map((platform) => PLATFORM_LABELS[platform]).join(" · ")}</p></section><TableOfContents headings={headings} />{related.length > 0 && <section><h2 className="sidebar-title">Related guides</h2><ul>{related.map((entry) => <li key={entry.url}><Link href={entry.url}>{entry.title}</Link></li>)}</ul></section>}<section><h2 className="sidebar-title">Written by Devin</h2>{article.updatedAt ? <p>Updated <time dateTime={article.updatedAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(article.updatedAt))}</time></p> : <p>Awaiting first review</p>}</section></aside>
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
