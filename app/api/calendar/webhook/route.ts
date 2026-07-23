import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { syncedCalendars } from "@/db/schema";
import { syncCalendar } from "@/lib/google-calendar-sync";
import { notify } from "@/lib/calendar-sync-notify";

// Google's push-notification callback. The channel token (set when we
// called events.watch) is the syncedCalendars.id — verified here against
// the stored channel/resource IDs so a guessed token can't trigger a sync
// for a calendar an attacker doesn't own.
export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceId = request.headers.get("x-goog-resource-id");
  const token = request.headers.get("x-goog-channel-token");
  const resourceState = request.headers.get("x-goog-resource-state");

  if (!channelId || !resourceId || !token) {
    return new NextResponse(null, { status: 404 });
  }

  const [cal] = await db.select().from(syncedCalendars).where(eq(syncedCalendars.id, token));
  if (!cal || cal.channelId !== channelId || cal.resourceId !== resourceId) {
    return new NextResponse(null, { status: 404 });
  }

  // Initial handshake sent when the channel is created — no event data yet.
  if (resourceState === "sync") {
    return new NextResponse(null, { status: 200 });
  }

  try {
    await syncCalendar(cal);
    notify(cal.userId);
  } catch (err) {
    console.error("Webhook-triggered sync failed", cal.id, err);
  }

  return new NextResponse(null, { status: 200 });
}
