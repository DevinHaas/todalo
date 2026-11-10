// Membership for the member badge: which number a user is (their place in sign-up
// order) and whether they're a founding member. Shared by /api/v1/account and the
// landing page's badge section.
import { and, count, eq, lt, lte, or } from "drizzle-orm";
import { db } from "@todalo/db";
import { user } from "@todalo/db/schema";
import { isFoundingMember } from "./founders";

export { FOUNDING_MEMBERS, isFoundingMember } from "./founders";

export type Membership = { number: number; since: string; founding: boolean };

// ponytail: the number is counted from sign-up order, so a deleted account shifts later members down by one.
// Store it on the user row at sign-up if numbers must never change.
export async function membership(userId: string): Promise<Membership | null> {
  const [me] = await db.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, userId));
  if (!me) return null;
  const [{ n }] = await db.select({ n: count() }).from(user)
    .where(or(lt(user.createdAt, me.createdAt), and(eq(user.createdAt, me.createdAt), lte(user.id, userId))));
  return { number: n, since: me.createdAt.toISOString(), founding: isFoundingMember(n) };
}

/** The number the next person to sign up will get. */
export async function nextMemberNumber(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(user);
  return n + 1;
}
