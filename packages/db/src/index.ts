import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// DB_QUERY_LOG=1: one "[db]" line per query on stdout; the perf harness counts them per API route.
const logger = process.env.DB_QUERY_LOG === "1" ? { logQuery: (query: string) => console.log(`[db] ${query.slice(0, 160)}`) } : undefined;
export const db = drizzle(process.env.DATABASE_URL!, { schema, logger });
