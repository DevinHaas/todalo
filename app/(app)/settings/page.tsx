import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { account as accountTable, syncedCalendars, calendarAccountSettings } from "@/db/schema";
import { auth } from "@/lib/auth";
import { listGoogleCalendars } from "@/lib/google-calendar-sync";
import { CalendarAccountCard } from "@/components/settings/calendar-account-card";
import { LinkGoogleAccountButton } from "@/components/settings/link-google-account-button";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const userId = session.user.id;

  const googleAccounts = await db
    .select()
    .from(accountTable)
    .where(and(eq(accountTable.userId, userId), eq(accountTable.providerId, "google")));

  const cards = await Promise.all(
    googleAccounts.map(async (acct) => {
      const [synced, [settings]] = await Promise.all([
        db.select().from(syncedCalendars).where(eq(syncedCalendars.accountId, acct.id)),
        db.select().from(calendarAccountSettings).where(eq(calendarAccountSettings.accountId, acct.id)),
      ]);
      const syncedById = new Map(synced.map((s) => [s.googleCalendarId, s]));

      let calendars: {
        id: string;
        summary: string;
        color: string;
        enabled: boolean;
      }[] = [];
      let needsConsent = false;

      try {
        const googleCalendars = await listGoogleCalendars(userId, acct.id);
        calendars = googleCalendars.map((c) => {
          const existing = syncedById.get(c.id);
          return {
            id: c.id,
            summary: c.summary,
            color: existing?.color ?? c.color,
            enabled: existing?.enabled ?? false,
          };
        });
      } catch {
        needsConsent = true;
      }

      const hasSyncError = synced.some((s) => s.enabled && !s.syncedAt);

      return {
        accountId: acct.id,
        email: acct.accountId,
        needsConsent,
        hasSyncError,
        showEvents: settings?.showEvents ?? true,
        calendars,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Calendars</h1>
      </div>

      {cards.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Google accounts connected yet. Sign in with Google to get started.
        </p>
      )}

      {cards.map((card) => (
        <CalendarAccountCard key={card.accountId} {...card} />
      ))}

      <div className="space-y-1 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          Find out how to show events from multiple accounts.
        </p>
        <LinkGoogleAccountButton />
      </div>
    </div>
  );
}
