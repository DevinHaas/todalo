"use client";

import { Switch } from "@/components/ui/switch";
import { useSmartDateRecognition } from "@/components/settings/smart-date-recognition";

export function GeneralSettings() {
  const { enabled, setEnabled, isPending } = useSmartDateRecognition();

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">General</h1>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Smart date recognition</p>
          <p className="text-sm text-muted-foreground">
            Recognize dates, times, and recurrence typed into a task title, like &quot;call mom tomorrow at
            4pm&quot;.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isPending} />
      </div>
    </div>
  );
}
