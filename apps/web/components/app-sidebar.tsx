"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  HelpCircle,
  Layers,
  LineChart,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  AudioLines,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskComposer } from "@/components/tasks/task-composer";
import { authClient } from "@/lib/auth-client";
import { useRamble } from "@/components/ramble/ramble-provider";
import { useKeyboard } from "@/components/keyboard/keyboard-provider";

// ponytail: Filters & Labels / Goals / Reporting / More have no backing
// features yet — shown inert for visual parity, wire up when they exist.
const INERT_NAV_ITEMS = [
  { label: "Goals", icon: Star, badge: "BETA" },
  { label: "Reporting", icon: LineChart },
];

export function AppSidebar({
  user,
  todayCount,
}: {
  user: { name: string; email: string; image?: string | null };
  todayCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const openRamble = useRamble();
  const keyboard = useKeyboard();
  const { setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <SidebarTrigger className="self-end group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:self-start" />
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Account menu" className="flex items-center gap-2 rounded-md px-1 py-1 text-sm font-medium hover:bg-sidebar-accent group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
            <Avatar className="size-6">
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="group-data-[collapsible=icon]:hidden">{user.name}</span>
            <ChevronDown className="size-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem render={<Link href="/settings" onNavigate={closeMobileSidebar}>Settings</Link>} />
            <DropdownMenuItem
              onSelect={() =>
                authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/login") },
                })
              }
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-start">
        <button
          type="button"
          aria-label="Add task"
          data-keyboard-capture
          onClick={() => setAddOpen(true)}
          className="flex h-8 flex-1 items-center gap-2 rounded-md px-2 text-sm font-medium text-brand hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
        >
          <Plus className="size-4" />
          <span className="group-data-[collapsible=icon]:hidden">Add task</span>
        </button>
        <button
          type="button"
          aria-label="Open Ramble"
          title="Open Ramble"
          onClick={() => openRamble()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-brand hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <AudioLines className="size-5" />
        </button>
        </div>
        <TaskComposer open={addOpen} onOpenChange={setAddOpen} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => document.querySelector<HTMLButtonElement>("[data-quick-find]")?.click()}>
                  <Search />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {[["Inbox", "/inbox"], ["Projects", "/projects"]].map(([label, href]) => <SidebarMenuItem key={href}><SidebarMenuButton isActive={pathname === href} render={<Link href={href} onNavigate={closeMobileSidebar}><Layers /><span>{label}</span></Link>} /></SidebarMenuItem>)}

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/today"}
                  render={
                    <Link href="/today" onNavigate={closeMobileSidebar}>
                      <CalendarClock />
                      <span>Today</span>
                    </Link>
                  }
                />
                {todayCount > 0 && <SidebarMenuBadge>{todayCount}</SidebarMenuBadge>}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/upcoming"}
                  render={
                    <Link href="/upcoming" onNavigate={closeMobileSidebar}>
                      <Layers />
                      <span>Upcoming</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>

              <SidebarMenuItem><SidebarMenuButton isActive={pathname.startsWith("/filters") || pathname.startsWith("/labels")} render={<Link href="/filters" onNavigate={closeMobileSidebar}><ListFilter /><span>Filters & Labels</span></Link>} /></SidebarMenuItem>
              {INERT_NAV_ITEMS.map(({ label, icon: Icon, badge }) => (
                <SidebarMenuItem key={label}>
                  <SidebarMenuButton disabled>
                    <Icon />
                    <span>{label}</span>
                    {badge && (
                      <span className="ml-auto rounded bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                        {badge}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <MoreHorizontal />
                  <span>More</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenuButton onClick={keyboard.openHelp} className="text-muted-foreground">
          <HelpCircle className="size-4" />
          <span>Help & resources</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
