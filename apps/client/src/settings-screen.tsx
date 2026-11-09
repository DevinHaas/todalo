import { useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { metadataReads, projectReads, settings, settingsReads } from "./runtime";
import { settingsMutations } from "./settings";
import { ComposerChoices, SmartDates } from "./composer";
import { SmartDatesSetting } from "./settings-views";
import { inlineError } from "./toasts";

/** Provides the signed-in account's smart date setting to every composer. */
export function SmartDatesProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const query = useQuery(settingsReads.settings(userId));
  return <SmartDates.Provider value={query.data?.smartDateRecognition ?? false}>{children}</SmartDates.Provider>;
}

/** Provides the account's projects and labels to every composer's picker and Additional actions. */
export function ComposerChoicesProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const projects = useQuery(projectReads.list(userId));
  const metadata = useQuery(metadataReads.list(userId));
  const value = useMemo(() => ({ projects: projects.data, labels: metadata.data?.labels }), [projects.data, metadata.data]);
  return <ComposerChoices.Provider value={value}>{children}</ComposerChoices.Provider>;
}

export function SmartDatesSettingScreen({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const query = useQuery(settingsReads.settings(userId));
  const update = useMutation(useMemo(() => settingsMutations(settings, cache, userId).update, [cache, userId]));
  // A failed save rolls the switch back; flipping it again retries.
  return <SmartDatesSetting state={query} onRetry={() => void query.refetch()} pending={update.isPending}
    error={update.error && inlineError(update.error) ? `${update.error.message} The setting was not changed.` : null}
    onChange={(smartDateRecognition) => update.mutate({ ...query.data!, smartDateRecognition })} />;
}
