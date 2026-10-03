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

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const [todayCount, smartDateRecognitionEnabled] = await Promise.all([
    getTodayTaskCount(session.user.id),
    getSmartDateRecognitionEnabled(session.user.id),
  ]);

  return (
    <SmartDateRecognitionProvider initialEnabled={smartDateRecognitionEnabled}>
      <SidebarProvider>
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
      </SidebarProvider>
    </SmartDateRecognitionProvider>
  );
}
