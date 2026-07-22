"use client";

import { useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  setCalendarVisible,
  setAccountShowEvents,
  resyncAccount,
  disconnectAccount,
} from "@/app/(app)/settings/actions";
import { LinkGoogleAccountButton } from "@/components/settings/link-google-account-button";

type Calendar = {
  id: string;
  summary: string;
  color: string;
  enabled: boolean;
};

export function CalendarAccountCard({
  accountId,
  email,
  needsConsent,
  hasSyncError,
  showEvents,
  calendars,
}: {
  accountId: string;
  email: string;
  needsConsent: boolean;
  hasSyncError: boolean;
  showEvents: boolean;
  calendars: Calendar[];
}) {
  const [isPending, startTransition] = useTransition();

  if (needsConsent) {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">{email}</span>
          <LinkGoogleAccountButton />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant calendar access to show this account&apos;s events.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{email}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className={`size-2 rounded-full ${hasSyncError ? "bg-destructive" : "bg-green-500"}`}
            />
            {hasSyncError ? "Error" : "Live"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => resyncAccount({ accountId }))}
          >
            Resync
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => disconnectAccount({ accountId }))}
          >
            Disconnect
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Resync if calendars aren&apos;t up-to-date.</p>

      <div className="mt-4 flex items-center justify-between border-t pt-4">
        <div>
          <p className="text-sm font-medium">Show events in Today/Upcoming</p>
          <p className="text-xs text-muted-foreground">Events are shown in Today and Upcoming.</p>
        </div>
        <Switch
          checked={showEvents}
          disabled={isPending}
          onCheckedChange={(checked) =>
            startTransition(() => setAccountShowEvents({ accountId, show: checked }))
          }
        />
      </div>

      <div className="mt-2 divide-y">
        {calendars.map((cal) => (
          <div key={cal.id} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: cal.color }} />
              <span className="text-sm">{cal.summary}</span>
            </div>
            <button
              type="button"
              disabled={isPending}
              aria-label={cal.enabled ? `Hide ${cal.summary}` : `Show ${cal.summary}`}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              onClick={() =>
                startTransition(() =>
                  setCalendarVisible({
                    accountId,
                    googleCalendarId: cal.id,
                    summary: cal.summary,
                    color: cal.color,
                    visible: !cal.enabled,
                  }),
                )
              }
            >
              {cal.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
