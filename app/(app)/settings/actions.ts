"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account, syncedCalendars, calendarAccountSettings, calendarEvents, userSettings } from "@/db/schema";
import { auth, requireUserId } from "@/lib/auth";
import { ensureWatchChannel, stopWatchChannel, syncCalendar } from "@/lib/google-calendar-sync";

async function requireOwnedAccount(userId: string, accountId: string) {
  const [row] = await db
    .select()
    .from(account)
    .where(and(eq(account.id, accountId), eq(account.userId, userId)));
  if (!row) throw new Error("Account not found");
  return row;
}

const setCalendarVisibleInput = z.object({
  accountId: z.string(),
  googleCalendarId: z.string(),
  summary: z.string(),
  color: z.string(),
  visible: z.boolean(),
});

export async function setCalendarVisible(input: z.infer<typeof setCalendarVisibleInput>) {
  const userId = await requireUserId();
  const data = setCalendarVisibleInput.parse(input);
  await requireOwnedAccount(userId, data.accountId);

  const [existing] = await db
    .select()
    .from(syncedCalendars)
    .where(
      and(
        eq(syncedCalendars.accountId, data.accountId),
        eq(syncedCalendars.googleCalendarId, data.googleCalendarId),
      ),
    );

  let row = existing;
  if (!row) {
    [row] = await db
      .insert(syncedCalendars)
      .values({
        userId,
        accountId: data.accountId,
        googleCalendarId: data.googleCalendarId,
        summary: data.summary,
        color: data.color,
        enabled: data.visible,
      })
      .returning();
  } else {
    [row] = await db
      .update(syncedCalendars)
      .set({ enabled: data.visible, summary: data.summary, color: data.color })
      .where(eq(syncedCalendars.id, row.id))
      .returning();
  }

  if (data.visible) {
    await syncCalendar(row);
    const [fresh] = await db.select().from(syncedCalendars).where(eq(syncedCalendars.id, row.id));
    if (fresh) await ensureWatchChannel(fresh);
  } else {
    await stopWatchChannel(row);
    await db.delete(calendarEvents).where(eq(calendarEvents.calendarId, row.id));
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

const setAccountShowEventsInput = z.object({
  accountId: z.string(),
  show: z.boolean(),
});

export async function setAccountShowEvents(input: z.infer<typeof setAccountShowEventsInput>) {
  const userId = await requireUserId();
  const data = setAccountShowEventsInput.parse(input);
  await requireOwnedAccount(userId, data.accountId);

  await db
    .insert(calendarAccountSettings)
    .values({ accountId: data.accountId, userId, showEvents: data.show })
    .onConflictDoUpdate({
      target: calendarAccountSettings.accountId,
      set: { showEvents: data.show, updatedAt: new Date() },
    });

  revalidatePath("/settings");
  revalidatePath("/");
}

const accountIdInput = z.object({ accountId: z.string() });

export async function resyncAccount(input: z.infer<typeof accountIdInput>) {
  const userId = await requireUserId();
  const { accountId } = accountIdInput.parse(input);
  await requireOwnedAccount(userId, accountId);

  const cals = await db
    .select()
    .from(syncedCalendars)
    .where(and(eq(syncedCalendars.accountId, accountId), eq(syncedCalendars.enabled, true)));

  for (const cal of cals) {
    await db.update(syncedCalendars).set({ syncToken: null }).where(eq(syncedCalendars.id, cal.id));
    const [fresh] = await db.select().from(syncedCalendars).where(eq(syncedCalendars.id, cal.id));
    if (!fresh) continue;
    await syncCalendar(fresh);
    const [afterSync] = await db.select().from(syncedCalendars).where(eq(syncedCalendars.id, cal.id));
    if (afterSync) await ensureWatchChannel(afterSync);
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

export async function disconnectAccount(input: z.infer<typeof accountIdInput>) {
  const userId = await requireUserId();
  const { accountId } = accountIdInput.parse(input);
  const acct = await requireOwnedAccount(userId, accountId);

  const cals = await db.select().from(syncedCalendars).where(eq(syncedCalendars.accountId, accountId));
  for (const cal of cals) {
    await stopWatchChannel(cal);
  }

  await db.delete(syncedCalendars).where(eq(syncedCalendars.accountId, accountId));
  await db.delete(calendarAccountSettings).where(eq(calendarAccountSettings.accountId, accountId));

  await auth.api.unlinkAccount({
    headers: await headers(),
    body: { providerId: acct.providerId, accountId: acct.accountId },
  });

  revalidatePath("/settings");
  revalidatePath("/");
}

export async function setSmartDateRecognitionEnabled(enabled: boolean) {
  const userId = await requireUserId();

  await db
    .insert(userSettings)
    .values({ userId, smartDateRecognitionEnabled: enabled })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { smartDateRecognitionEnabled: enabled, updatedAt: new Date() },
    });

  revalidatePath("/settings");
}
