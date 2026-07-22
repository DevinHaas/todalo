"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Subscribes to /api/calendar/stream (SSE) and refreshes the current route
// whenever the server signals that synced calendar data changed. EventSource
// reconnects automatically on drop, so no manual retry logic is needed.
export function CalendarSyncListener() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/calendar/stream");
    source.onmessage = () => router.refresh();
    return () => source.close();
  }, [router]);

  return null;
}
