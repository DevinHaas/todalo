import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { loadContent } from "./content";

export { loadContent } from "./content";

const visible = new Set(loadContent().articles.map((article) => article.url));
const compiled = docs.toFumadocsSource();

export const source = loader({
  baseUrl: "/",
  source: { files: compiled.files.filter((file) => file.type === "page" && visible.has(file.data.article.url)) },
});
