// The publication boundary. Pure, so both the build-time loader
// (content-loader.ts) and the app (content.ts) build Content the same way.
import { categories, type Category } from "./categories";
import type { ArticleFrontmatter } from "./schema";

export const HELP_ORIGIN = "https://help.todalo.app";

export type Article = ArticleFrontmatter & {
  slug: string;
  url: string;
  file: string;
  body: string;
  updatedAt: string | null;
};

export type ContentCategory = Category & { articles: Article[] };
export type ContentOptions = {
  dir?: string;
  publicDir?: string;
  preview?: boolean;
  environment?: string;
};

export type Content = {
  articles: Article[];
  categories: ContentCategory[];
  preview: boolean;
  article: (url: string) => Article | undefined;
  category: (slug: string) => ContentCategory | undefined;
  search: { title: string; description: string; category: string; url: string; content: string }[];
  sitemap: { url: string; updatedAt: string | null }[];
};

export function isContentPreview(options: Pick<ContentOptions, "preview" | "environment"> = {}): boolean {
  if (process.env.NODE_ENV === "production" || options.environment === "production") return false;
  return options.preview ?? process.env.DOCS_PREVIEW === "true";
}

/** Published articles (plus drafts in local preview), ordered, with every derived view. */
export function buildContent(allArticles: readonly Article[], options: ContentOptions = {}): Content {
  const preview = isContentPreview(options);
  const categoryOrder = new Map(categories.map((category) => [category.slug, category.order]));
  const articles = allArticles.filter((article) => article.published || preview).sort((first, second) =>
    (categoryOrder.get(first.category)! - categoryOrder.get(second.category)!) ||
    first.order - second.order || first.slug.localeCompare(second.slug));
  const visibleCategories = categories.map((category) => ({
    ...category,
    articles: articles.filter((article) => article.category === category.slug),
  })).filter((category) => category.articles.length > 0);
  const byUrl = new Map(articles.map((article) => [article.url, article]));
  const byCategory = new Map(visibleCategories.map((category) => [category.slug as string, category]));

  return {
    articles,
    categories: visibleCategories,
    preview,
    article: (url) => byUrl.get(url),
    category: (slug) => byCategory.get(slug),
    search: articles.map(({ title, description, category, url, body }) => ({
      title, description, category, url, content: body,
    })),
    sitemap: [
      { url: "/", updatedAt: null },
      ...visibleCategories.map((category) => ({ url: `/${category.slug}`, updatedAt: null })),
      ...articles.map(({ url, updatedAt }) => ({ url, updatedAt })),
    ],
  };
}
