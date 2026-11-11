import { existsSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";
import { remarkHeading } from "fumadocs-core/mdx-plugins/remark-heading";
import { remarkGfm } from "fumadocs-core/mdx-plugins/remark-gfm";
import type { Article, Content } from "./content-model";

type Node = {
  type: string;
  name?: string;
  value?: string | { data?: { estree?: { body?: { expression?: { type?: string; value?: unknown } }[] } } } | null;
  url?: string;
  identifier?: string;
  children?: Node[];
  attributes?: Node[];
  data?: { hProperties?: { id?: string } };
};

type References = { anchors: Set<string>; links: string[]; images: string[]; pairs: [string, string][] };

function walk(node: Node, visitor: (node: Node) => void) {
  visitor(node);
  node.children?.forEach((child) => walk(child, visitor));
}

function attribute(node: Node, name: string): string | undefined {
  const property = node.attributes?.find((property) => property.name === name);
  if (!property) return undefined;
  if (typeof property.value === "string") return property.value;
  const expression = property.value?.data?.estree?.body?.[0]?.expression;
  if (expression?.type === "Literal" && typeof expression.value === "string") return expression.value;
  throw new Error(`${node.name}: ${name} must be a static string so its reference can be validated`);
}

function references(article: Article): References {
  const localRequire = createRequire(import.meta.url);
  const mdxRequire = createRequire(localRequire.resolve("fumadocs-mdx/package.json"));
  const { createProcessor } = mdxRequire("@mdx-js/mdx") as {
    createProcessor: (options: object) => { parse: (source: string) => Node };
  };
  const tree = createProcessor({ remarkPlugins: [remarkGfm] }).parse(article.body);
  remarkHeading({ generateToc: false })(tree as Parameters<ReturnType<typeof remarkHeading>>[0], {} as Parameters<ReturnType<typeof remarkHeading>>[1], () => undefined);
  const output: References = { anchors: new Set(), links: [], images: [], pairs: [] };
  const definitions = new Map<string, string>();
  walk(tree, (node) => {
    if (node.type === "definition" && node.identifier && node.url) definitions.set(node.identifier.toLowerCase(), node.url);
  });
  walk(tree, (node) => {
    const anchor = node.type === "heading" ? node.data?.hProperties?.id :
      node.type.startsWith("mdxJsx") ? attribute(node, "id") : undefined;
    if (anchor) {
      if (output.anchors.has(anchor)) throw new Error(`duplicate anchor #${anchor}`);
      output.anchors.add(anchor);
    }
    if (node.type === "link" && node.url) output.links.push(node.url);
    if (node.type === "image" && node.url) output.images.push(node.url);
    if (node.type === "linkReference" || node.type === "imageReference") {
      const url = definitions.get(node.identifier?.toLowerCase() ?? "");
      if (!url) throw new Error(`undefined reference ${node.identifier}`);
      (node.type === "linkReference" ? output.links : output.images).push(url);
    }
    if (!node.type.startsWith("mdxJsx")) return;
    const href = attribute(node, "href");
    if (href !== undefined) output.links.push(href);
    const src = attribute(node, "src");
    if (src !== undefined) output.images.push(src);
    if (node.name === "ThemedScreenshot" || node.name === "Screenshot") {
      const light = attribute(node, "light") ?? attribute(node, "lightSrc");
      const dark = attribute(node, "dark") ?? attribute(node, "darkSrc");
      if (!light || !dark || light === dark) throw new Error(`${node.name} requires distinct light and dark screenshots`);
      output.pairs.push([light, dark]);
      output.images.push(light, dark);
    }
  });
  return output;
}

function resolveLink(reference: string, article: Article): URL {
  const link = new URL(reference, `https://help.todalo.app${article.url}`);
  if (link.origin === "https://help.todalo.app" && /\.mdx?$/.test(link.pathname)) {
    link.pathname = link.pathname.replace(/\.mdx?$/, "");
  }
  return link;
}

function assertImage(reference: string, publicDir: string) {
  if (!reference.startsWith("/") || reference.startsWith("//")) throw new Error(`image must be a local public path: ${reference}`);
  const path = resolve(publicDir, decodeURIComponent(reference.split(/[?#]/)[0]).replace(/^\/+/, ""));
  const contained = (target: string) => {
    const local = relative(realpathSync(publicDir), target);
    return local !== ".." && !local.startsWith("../") && !isAbsolute(local);
  };
  if (!existsSync(publicDir) || !existsSync(path) || !contained(realpathSync(path)) || !statSync(path).isFile()) {
    throw new Error(`missing or unsafe image ${reference}`);
  }
}

export function validateContent(content: Content, allArticles: readonly Article[], publicDir: string): void {
  const allByUrl = new Map(allArticles.map((article) => [article.url, article]));
  const parsed = new Map<string, References>();
  for (const article of content.articles) {
    try { parsed.set(article.url, references(article)); }
    catch (error) { throw new Error(`${article.file}: ${String(error)}`); }
  }
  for (const article of content.articles) {
    try {
      const refs = parsed.get(article.url)!;
      const targetFor = (url: string) => {
        const target = allByUrl.get(url);
        if (!target || (!target.published && (article.published || !content.preview))) {
          throw new Error(`missing or unpublished article ${url}`);
        }
        return target;
      };
      for (const url of article.related) {
        if (url === article.url) throw new Error(`related article cannot reference itself: ${url}`);
        targetFor(url);
      }
      for (const reference of refs.links) {
        const link = resolveLink(reference, article);
        if (link.origin !== "https://help.todalo.app") continue;
        const path = decodeURIComponent(link.pathname).replace(/\/$/, "") || "/";
        const category = content.category(path.slice(1));
        if (path === "/" || (category && (!article.published || category.articles.some((entry) => entry.published)))) {
          if (link.hash) throw new Error(`unverifiable anchor ${reference}`);
          continue;
        }
        const target = targetFor(path);
        if (link.hash && !parsed.get(target.url)?.anchors.has(decodeURIComponent(link.hash.slice(1)))) {
          throw new Error(`missing anchor ${reference}`);
        }
      }
      const paired = new Set(refs.pairs.flat());
      for (const image of refs.images) {
        assertImage(image, publicDir);
        if (!image.startsWith("/screenshots/") || paired.has(image)) continue;
        const counterpart = image.replace(/([.-])(light|dark)(?=\.)/, (_match, delimiter: string, theme: string) =>
          `${delimiter}${theme === "light" ? "dark" : "light"}`).replace(/\/(light|dark)\//, (_match, theme: string) =>
          `/${theme === "light" ? "dark" : "light"}/`);
        if (counterpart === image) throw new Error(`screenshot requires a light/dark pair: ${image}`);
        assertImage(counterpart, publicDir);
      }
    } catch (error) { throw new Error(`${article.file}: ${String(error)}`); }
  }
}
