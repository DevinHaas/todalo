import { relative, resolve } from "node:path";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { docsDirectory, loadContent } from "./lib/content-loader";
import { articleSchema } from "./lib/schema";

const content = loadContent();
const root = resolve(docsDirectory(), "content");
const articles = new Map(content.articles.map((article) => [article.file, article]));

export const docs = defineDocs({
  dir: "content",
  docs: {
    files: content.articles.length ? content.articles.map((article) => article.file) : ["!**/*"],
    schema: ({ path }) => articleSchema.transform((data) => {
      const file = relative(root, resolve(path)).replaceAll("\\", "/");
      const article = articles.get(file);
      if (!article) throw new Error(`Article is not visible in this build: ${path}`);
      return { ...data, article };
    }),
  },
  meta: { files: ["!**/*"] },
});

export default defineConfig();
