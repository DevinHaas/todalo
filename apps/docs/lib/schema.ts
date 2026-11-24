import { pageSchema } from "fumadocs-core/source/schema";
import { z } from "zod";
import { categories } from "./categories";

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = slugPattern.source.slice(1, -1);
export const articleUrlPattern = new RegExp(`^/${slug}/${slug}$`);

export const articleSchema = pageSchema.extend({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  category: z.enum(categories.map((category) => category.slug)),
  order: z.number().int().positive(),
  /** Heading the article is listed under on its category page; defaults to the category name. */
  section: z.string().trim().min(1).optional(),
  platforms: z.array(z.enum(["web", "mac", "ios"])).min(1)
    .refine((values) => new Set(values).size === values.length, "Platforms must be unique"),
  related: z.array(z.string().regex(articleUrlPattern)).max(4)
    .refine((values) => new Set(values).size === values.length, "Related articles must be unique"),
  badge: z.enum(["experiment", "advanced"]).optional(),
  published: z.boolean(),
});

export type ArticleFrontmatter = z.infer<typeof articleSchema>;
