"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, requireUserId } from "@/lib/auth";
import { setSmartDateRecognition } from "@todalo/server/settings";
import * as calendar from "@todalo/server/calendar-connections";
import { calendarVisibilityInput } from "@todalo/server/calendar-input";

// Calendar actions are thin wrappers over @todalo/server/calendar-connections
// (shared with /api/v1/calendar); a foreign account throws as legacy did.
function owned(found: boolean) {
  if (!found) throw new Error("Account not found");
  revalidatePath("/settings");
  revalidatePath("/");
}

const setCalendarVisibleInput = calendarVisibilityInput.extend({ accountId: z.string() });

export async function setCalendarVisible(input: z.infer<typeof setCalendarVisibleInput>) {
  const userId = await requireUserId();
  const { accountId, ...data } = setCalendarVisibleInput.parse(input);
  owned(await calendar.setCalendarVisible(userId, accountId, data));
}

const setAccountShowEventsInput = z.object({
  accountId: z.string(),
  show: z.boolean(),
});

export async function setAccountShowEvents(input: z.infer<typeof setAccountShowEventsInput>) {
  const userId = await requireUserId();
  const data = setAccountShowEventsInput.parse(input);
  owned(await calendar.setAccountShowEvents(userId, data.accountId, data.show));
}

const accountIdInput = z.object({ accountId: z.string() });

export async function resyncAccount(input: z.infer<typeof accountIdInput>) {
  const userId = await requireUserId();
  const { accountId } = accountIdInput.parse(input);
  owned(await calendar.resyncAccount(userId, accountId));
}

export async function disconnectAccount(input: z.infer<typeof accountIdInput>) {
  const userId = await requireUserId();
  const { accountId } = accountIdInput.parse(input);
  const session = await headers();
  owned(await calendar.disconnectAccount(userId, accountId, (body) => auth.api.unlinkAccount({ headers: session, body })));
}

export async function setSmartDateRecognitionEnabled(enabled: boolean) {
  const userId = await requireUserId();
  await setSmartDateRecognition(userId, z.boolean().parse(enabled));
  revalidatePath("/settings");
}
