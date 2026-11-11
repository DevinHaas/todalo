import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadContent } from "@/lib/content";
import { Support } from "@/components/support";
import { Illustration } from "@/components/illustration-slot";

type Props = { params: Promise<{ category: string }> };

function getCategory(slug: string) {
  const category = loadContent().category(slug);
  if (!category) notFound();
  return { category, articles: category.articles };
}

export default async function CategoryPage({ params }: Props) {
  const { category, articles } = getCategory((await params).category);
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Help center</Link><span aria-hidden="true">/</span><span aria-current="page">{category.name}</span></nav>
    <header className="category-heading"><div><p className="eyebrow">{articles.length} {articles.length === 1 ? "guide" : "guides"}</p><h1>{category.name}</h1><p>{category.tagline}</p></div><Illustration src={category.illustration} compact /></header>
    <div className="article-list">{articles.map((article) => <Link key={article.url} href={article.url}><div><h2>{article.title}</h2><p>{article.description}</p></div><span aria-hidden="true">↗</span></Link>)}</div>
    <Support title="Still need a hand?" />
  </>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = getCategory((await params).category);
  return { title: category.name, description: category.tagline, alternates: { canonical: `/${category.slug}` } };
}

export function generateStaticParams() {
  return loadContent().categories.map((category) => ({ category: category.slug }));
}

export const dynamicParams = false;
