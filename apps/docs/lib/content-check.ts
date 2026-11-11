import { loadContent } from "./content-loader";

const content = loadContent();
console.log(`Validated ${content.articles.length} visible articles across ${content.categories.length} categories${content.preview ? " (local preview)" : ""}.`);
