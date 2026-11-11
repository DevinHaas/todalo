import { defineConfig, defineDocs } from "fumadocs-mdx/config";

// Stock frontmatter (title, optional description) for now; the content-model
// ticket extends the schema here.
export const docs = defineDocs({ dir: "content" });

export default defineConfig();
