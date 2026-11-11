import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { frontmatter } from "fumadocs-core/content/md/frontmatter";
import { validateContent } from "./content-validation";
import { buildContent, type Article, type Content, type ContentOptions } from "./content-model";
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

/**
 * Dates written by the Docker build (see Dockerfile), whose builder has no git:
 * one "category/article.mdx<TAB>ISO date" line per article.
 */
function readManifest(path: string): Map<string, string> {
  if (!existsSync(path)) return new Map();
  return new Map(readFileSync(path, "utf8").split("\n").map((line) => line.split("\t") as [string, string]));
}

function updatedAt(path: string, file: string, manifest: Map<string, string>): string | null {
  let date: string | undefined;
  try {
    date = execFileSync("git", ["log", "-1", "--follow", "--format=%aI", "--", path], {
      cwd: dirname(path), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {}
  date ||= manifest.get(file);
  return date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null;
}

export function loadContent(options: ContentOptions = {}): Content {
  const dir = resolve(options.dir ?? join(docsDirectory(), "content"));
  const publicDir = resolve(options.publicDir ?? join(docsDirectory(), "public"));
  const manifest = readManifest(resolve(dir, "../.article-dates"));
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
    return { ...metadata.data, slug, url, file, body: parsed.content, updatedAt: updatedAt(path, file, manifest) };
  });
  const content = buildContent(allArticles, options);
  validateContent(content, allArticles, publicDir);
  return content;
}
