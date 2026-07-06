import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTodayTaskCount } from "@/lib/tasks";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

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
        <div className="flex items-center border-b px-4 py-2">
          <SidebarTrigger />
        </div>
        <main className="p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
