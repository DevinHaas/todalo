import type { MetadataRoute } from "next";
import { isContentPreview } from "@/lib/content";

export default function robots(): MetadataRoute.Robots {
  return { rules: isContentPreview() ? { userAgent: "*", disallow: "/" } : { userAgent: "*", allow: "/" }, sitemap: "https://help.todalo.app/sitemap.xml" };
}
