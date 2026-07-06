"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TaskQuickAdd } from "@/components/tasks/task-quick-add";
import { authClient } from "@/lib/auth-client";

// ponytail: Filters & Labels / Goals / Reporting / More have no backing
// features yet — shown inert for visual parity, wire up when they exist.
const INERT_NAV_ITEMS = [
  { label: "Filters & Labels", icon: ListFilter },
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
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <SidebarTrigger className="self-end" />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1 py-1 text-sm font-medium hover:bg-sidebar-accent">
            <Avatar className="size-6">
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="group-data-[collapsible=icon]:hidden">{user.name}</span>
            <ChevronDown className="size-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => authClient.signOut()}>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-1 text-sm font-medium text-brand hover:opacity-80"
          >
            <Plus className="size-4" />
            <span className="group-data-[collapsible=icon]:hidden">Add task</span>
          </button>
          <DialogContent>
            <DialogTitle>Add task</DialogTitle>
            <TaskQuickAdd onCreated={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                {/* ponytail: no search backend yet */}
                <SidebarMenuButton disabled>
                  <Search />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/today"}
                  render={
                    <Link href="/today">
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
                    <Link href="/upcoming">
                      <Layers />
                      <span>Upcoming</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>

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
        {/* ponytail: no help center yet */}
        <SidebarMenuButton disabled className="text-muted-foreground">
          <HelpCircle className="size-4" />
          <span>Help & resources</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
