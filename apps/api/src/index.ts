import { createApi, productionDependencies } from "./app";
import { auth } from "@todalo/auth";
import { createAuthRoutes } from "./auth-routes";

const app = createApi(productionDependencies()).use(createAuthRoutes(auth)).listen({
  port: Number(process.env.RAMBLE_PORT ?? 3001),
  hostname: process.env.RAMBLE_HOST ?? "0.0.0.0",
});
console.log(`Ramble API listening on port ${app.server?.port}`);
