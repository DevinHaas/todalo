import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTodayTaskCount } from "@/lib/tasks";
import { getSmartDateRecognitionEnabled } from "@/lib/settings";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DisplaySettingsProvider, DisplayMenu, LayoutSwitcher } from "@/components/tasks/display-settings";
import { SmartDateRecognitionProvider } from "@/components/settings/smart-date-recognition";
import { CalendarSyncListener } from "@/components/calendar-sync-listener";
import { RambleProvider } from "@/components/ramble/ramble-provider";
import { getRambleProjects } from "@/lib/ramble-projects";
import { loadKeyboardPreferences } from "@/app/(app)/settings/keyboard-actions";
import { KeyboardProvider } from "@/components/keyboard/keyboard-provider";
import { defaultPreferences } from "@/lib/keyboard";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const [todayCount, smartDateRecognitionEnabled, rambleProjects, keyboard] = await Promise.all([
    getTodayTaskCount(session.user.id),
    getSmartDateRecognitionEnabled(session.user.id),
    getRambleProjects(session.user.id),
    loadKeyboardPreferences().catch(() => ({ preferences: defaultPreferences(), error: "Shortcuts could not load. Retry from Settings." })),
  ]);

  return (
    <SmartDateRecognitionProvider initialEnabled={smartDateRecognitionEnabled}>
      <RambleProvider projects={rambleProjects}>
      <SidebarProvider>
        <KeyboardProvider initialPreferences={keyboard.preferences} initialError={keyboard.error}>
        <CalendarSyncListener />
        <AppSidebar user={session.user} todayCount={todayCount} />
        <SidebarInset>
          <DisplaySettingsProvider>
            <div className="flex items-center justify-between px-4 py-2">
              <LayoutSwitcher />
              <DisplayMenu />
            </div>
            <main className="p-6">{children}</main>
          </DisplaySettingsProvider>
        </SidebarInset>
        </KeyboardProvider>
      </SidebarProvider>
      </RambleProvider>
    </SmartDateRecognitionProvider>
  );
}
