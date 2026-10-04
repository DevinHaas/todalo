// Isolated manual QA service: no production auth/database imports or .env data.
import { memoryAdapter } from "better-auth/adapters/memory";
import { createSessionAuth } from "../../../packages/auth/src/config";
import { createAuthRoutes } from "../../api/src/auth-routes";

const auth = createSessionAuth({
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  baseURL: "http://localhost:5173",
  secret: "local-smoke-test-only-secret-32-characters",
  trustedOrigins: ["http://localhost:5173"],
});
await auth.api.signUpEmail({ body: { name: "Development User", email: "existing@example.test", password: "dev-password-123" } });
createAuthRoutes(auth).listen({ hostname: "127.0.0.1", port: 3009 });
console.log("Isolated account QA API listening on 127.0.0.1:3009");
