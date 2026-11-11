// The app's one door to content. source.config.ts compiles only the articles
// the loader let through (content-loader.ts reads and validates them), so
// everything here is already inside the publication boundary.
import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { buildContent } from "./content-model";

export { HELP_ORIGIN, isContentPreview, type Article, type ContentCategory, type ContentSection } from "./content-model";

export const content = buildContent(docs.docs.map((page) => page.article));

export const source = loader({ baseUrl: "/", source: docs.toFumadocsSource() });
