import { docs } from "collections/server";
import { getContent as selectContent, type Content, type ContentOptions } from "./content-model";

export type { Article, Content, ContentCategory, ContentOptions } from "./content-model";
export { isContentPreview } from "./content-model";

export function loadContent(options: Pick<ContentOptions, "preview" | "environment"> = {}): Content {
  return selectContent(docs.docs.map((page) => page.article), options);
}

export const getContent = loadContent;
