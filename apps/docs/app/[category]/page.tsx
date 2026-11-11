import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { content } from "@/lib/content";
import { Support } from "@/components/support";
import { PageChrome } from "@/components/page-chrome";
import { CategoryNav } from "@/components/category-nav";
import { Icon } from "@/components/icons";

type Props = { params: Promise<{ category: string }> };

function getCategory(slug: string) {
  const category = content.category(slug);
  if (!category) notFound();
  return category;
}

export default async function CategoryPage({ params }: Props) {
  const category = getCategory((await params).category);
  return <>
    <PageChrome trail={[{ label: "Help Center", href: "/" }, { label: category.name }]} />
    <h1 className="sr-only">{category.name}</h1>
    <div className="category-layout">
      <CategoryNav
        categories={content.categories.map(({ slug, name }) => ({ slug, name }))}
        current={category.slug}
        sections={category.sections.map((section) => ({ title: section.name, url: `#${section.id}` }))}
      />
      <div>
        {category.sections.map((section) => <section key={section.id} className="category-section" aria-labelledby={section.id}>
          <h2 id={section.id}>{section.name}</h2>
          <ul className="article-grid">{section.articles.map((article) => <li key={article.url}>
            <Link href={article.url}>
              <span>{article.title}</span>
              <span className="read-pill" aria-hidden="true">Read article <Icon name="arrow-right" /></span>
            </Link>
          </li>)}</ul>
        </section>)}
        <Support title="Couldn’t find what you need?" />
      </div>
    </div>
  </>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getCategory((await params).category);
  return { title: category.name, description: category.tagline, alternates: { canonical: `/${category.slug}` } };
}

export function generateStaticParams() {
  return content.categories.map((category) => ({ category: category.slug }));
}

export const dynamicParams = false;
