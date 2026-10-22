import { db } from "@todalo/db";
import { sql } from "drizzle-orm";
import { createApi, productionDependencies } from "./app";

// Opening the database link costs seconds; pay it at boot, not on the first Ramble.
db.execute(sql`select 1`).catch(() => {});

const app = createApi(productionDependencies()).listen({
  port: Number(process.env.RAMBLE_PORT ?? 3001),
  hostname: process.env.RAMBLE_HOST ?? "0.0.0.0",
});
console.log(`Ramble API listening on port ${app.server?.port}`);
