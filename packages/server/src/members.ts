// Membership for the member badge: which number a user is (their place in sign-up
// order) and whether they're a founding member. Shared by /api/v1/account and the
// landing page's badge section.
import { count, eq, sql } from "drizzle-orm";
import { db } from "@todalo/db";
import { user } from "@todalo/db/schema";
import { isFoundingMember } from "./founders";

export { FOUNDING_MEMBERS, isFoundingMember } from "./founders";

export type Membership = { number: number; since: string; founding: boolean };

// ponytail: the number is counted from sign-up order, so a deleted account shifts later members down by one.
// Store it on the user row at sign-up if numbers must never change.
export async function membership(userId: string): Promise<Membership | null> {
  // One round trip (it is on the account read, the first request of a launch): the user's sign-up
  // time and how many signed up before or with them, as a correlated count.
  const [me] = await db.select({
    createdAt: user.createdAt,
    n: sql<number>`(select count(*) from "user" as earlier where earlier.created_at < "user"."created_at" or (earlier.created_at = "user"."created_at" and earlier.id <= "user"."id"))`.mapWith(Number),
  }).from(user).where(eq(user.id, userId));
  if (!me) return null;
  return { number: me.n, since: me.createdAt.toISOString(), founding: isFoundingMember(me.n) };
}

/** The number the next person to sign up will get. */
export async function nextMemberNumber(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(user);
  return n + 1;
}
