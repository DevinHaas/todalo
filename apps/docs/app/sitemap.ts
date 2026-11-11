import type { MetadataRoute } from "next";
import { loadContent } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
  return loadContent({ preview: false }).sitemap.map((entry) => ({ url: new URL(entry.url, "https://help.todalo.app").href, lastModified: entry.updatedAt ?? undefined }));
}
