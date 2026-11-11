import type { MetadataRoute } from "next";
import { HELP_ORIGIN, content } from "@/lib/content";
import { buildContent } from "@/lib/content-model";

// Published articles only, even in local preview.
export default function sitemap(): MetadataRoute.Sitemap {
  return buildContent(content.articles, { preview: false }).sitemap.map((entry) => ({ url: new URL(entry.url, HELP_ORIGIN).href, lastModified: entry.updatedAt ?? undefined }));
}
