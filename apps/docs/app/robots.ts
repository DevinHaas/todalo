import type { MetadataRoute } from "next";
import { HELP_ORIGIN, isContentPreview } from "@/lib/content";

export default function robots(): MetadataRoute.Robots {
  return { rules: isContentPreview() ? { userAgent: "*", disallow: "/" } : { userAgent: "*", allow: "/" }, sitemap: `${HELP_ORIGIN}/sitemap.xml` };
}
