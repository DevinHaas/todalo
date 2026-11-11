import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { frontmatter } from "fumadocs-core/content/md/frontmatter";
import { validateContent } from "./content-validation";
import { getContent, type Article, type Content, type ContentOptions } from "./content-model";
import { articleSchema, slugPattern } from "./schema";

export function docsDirectory(): string {
  return fileURLToPath(new URL("../", import.meta.url));
}

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).sort((first, second) => first.name.localeCompare(second.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Content symlinks are not supported: ${path}`);
      return entry.isDirectory() ? filesIn(path) : /\.mdx?$/.test(entry.name) ? [path] : [];
    });
}

function lastUpdated(path: string): Article["lastUpdated"] {
  try {
    const output = execFileSync("git", ["log", "-1", "--follow", "--format=%aI%x00%an", "--", path], {
      cwd: dirname(path), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const [date, name] = output.split("\0");
    if (date && Number.isFinite(Date.parse(date))) {
      return { author: name?.trim().split(/\s+/)[0] || "Devin", date: new Date(date).toISOString() };
    }
  } catch {}
  return { author: "Devin", date: null };
}

export function loadContent(options: ContentOptions = {}): Content {
  const dir = resolve(options.dir ?? join(docsDirectory(), "content"));
  const publicDir = resolve(options.publicDir ?? join(docsDirectory(), "public"));
  const urls = new Set<string>();
  const allArticles = filesIn(dir).map((path): Article => {
    const file = relative(dir, path).split(sep).join("/");
    const parts = file.replace(/\.mdx?$/, "").split("/");
    if (parts.length !== 2 || parts.some((part) => !slugPattern.test(part))) {
      throw new Error(`${file}: expected a lowercase /category/article slug`);
    }
    const [category, slug] = parts;
    const url = `/${category}/${slug}`;
    if (urls.has(url)) throw new Error(`${file}: duplicate article URL ${url}`);
    urls.add(url);
    const parsed = frontmatter(readFileSync(path, "utf8"));
    const metadata = articleSchema.safeParse(parsed.data);
    if (!metadata.success) throw new Error(`${file}: invalid frontmatter: ${metadata.error.message}`);
    if (metadata.data.category !== category) throw new Error(`${file}: category must match its directory`);
    const updated = lastUpdated(path);
    return { ...metadata.data, slug, url, file, body: parsed.content, updatedAt: updated.date, lastUpdated: updated };
  });
  const content = getContent(allArticles, options);
  validateContent(content, allArticles, publicDir);
  return content;
}
