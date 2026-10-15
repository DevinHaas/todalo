import { useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settings, settingsReads } from "./runtime";
import { settingsMutations } from "./settings";
import { SmartDates } from "./composer";
import { SmartDatesSetting } from "./settings-views";

/** Provides the signed-in account's smart date setting to every composer. */
export function SmartDatesProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const query = useQuery(settingsReads.settings(userId));
  return <SmartDates.Provider value={query.data?.smartDateRecognition ?? false}>{children}</SmartDates.Provider>;
}

export function SmartDatesSettingScreen({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const query = useQuery(settingsReads.settings(userId));
  const update = useMutation(useMemo(() => settingsMutations(settings, cache, userId).update, [cache, userId]));
  // A failed save rolls the switch back; flipping it again retries.
  return <SmartDatesSetting state={query} onRetry={() => void query.refetch()} pending={update.isPending}
    error={update.error ? `${update.error.message} The setting was not changed.` : null}
    onChange={(smartDateRecognition) => update.mutate({ smartDateRecognition })} />;
}
