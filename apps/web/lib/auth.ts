import { headers } from "next/headers";
import { auth } from "@todalo/auth";

export { auth };

// Server Actions all need this — the (app) layout already guarantees a
// session exists, so a missing one here means something's misconfigured.
export async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not authenticated");
  return session.user.id;
}
