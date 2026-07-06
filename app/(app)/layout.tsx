import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTodayTaskCount } from "@/lib/tasks";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DisplaySettingsProvider, DisplayMenu, LayoutSwitcher } from "@/components/tasks/display-settings";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const todayCount = await getTodayTaskCount(session.user.id);

  return (
    <SidebarProvider>
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
  );
}
