import { createSearchAPI } from "fumadocs-core/search/server";
import { loadContent } from "@/lib/content";
import { categories } from "@/lib/categories";

const search = createSearchAPI("simple", {
  indexes: () => loadContent().search.map((article) => ({
    title: article.title,
    description: article.description,
    url: article.url,
    content: article.content,
    breadcrumbs: [categories.find((category) => category.slug === article.category)!.name],
  })),
});

export const GET = search.staticGET;
export const dynamic = "force-static";
