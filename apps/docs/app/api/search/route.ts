import { createSearchAPI } from "fumadocs-core/search/server";
import { content } from "@/lib/content";
import { searchIndex } from "@/lib/search";

const search = createSearchAPI("simple", { indexes: () => searchIndex(content) });

export const GET = search.staticGET;
export const dynamic = "force-static";
