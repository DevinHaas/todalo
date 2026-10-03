"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function LinkGoogleAccountButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        authClient.linkSocial({
          provider: "google",
          callbackURL: "/settings",
          scopes: CALENDAR_SCOPES,
        })
      }
    >
      Link another Google account
    </Button>
  );
}
