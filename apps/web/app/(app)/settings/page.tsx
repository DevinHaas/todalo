import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCalendarAccounts } from "@todalo/server/calendar-connections";
import { CalendarAccountCard } from "@/components/settings/calendar-account-card";
import { LinkGoogleAccountButton } from "@/components/settings/link-google-account-button";
import { GeneralSettings } from "@/components/settings/general-settings";
import { ShortcutSettings } from "@/components/keyboard/shortcut-settings";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const userId = session.user.id;

  const cards = (await getCalendarAccounts(userId)).map(({ id, ...card }) => ({ accountId: id, ...card }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <GeneralSettings />
      <ShortcutSettings />

      <div className="flex items-center justify-between border-t pt-6">
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
