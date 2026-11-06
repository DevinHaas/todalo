"use client";
import { useEffect, useState } from "react";
// A temporary capture-only route using the existing screen/components. The
// capture script copies this file and its fixture into apps/web/app, then removes
// them on exit. It never ships an authentication bypass or touches user data.
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DisplaySettingsProvider, DisplayMenu, LayoutSwitcher } from "@/components/tasks/display-settings";
import { SmartDateRecognitionProvider } from "@/components/settings/smart-date-recognition";
import { RambleProvider } from "@/components/ramble/ramble-provider";
import { KeyboardProvider } from "@/components/keyboard/keyboard-provider";
import { defaultPreferences } from "@/lib/keyboard";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
import { TodayView } from "@/components/tasks/today-view";
import { TodayScheduleView } from "@/components/tasks/today-schedule-view";
import { baselineTasks, baselineEvents, baselineUser } from "./tauri-baseline-fixture";

export default function BaselinePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Render the fixture only after hydration so server time cannot influence
  // its date headings. The capture runner installs the browser clock first.
  if (!mounted) return null;
  return <SmartDateRecognitionProvider initialEnabled={true}><RambleProvider projects={[]}>
    <SidebarProvider><KeyboardProvider initialPreferences={defaultPreferences()}>
      <AppSidebar user={baselineUser} todayCount={2} />
      <SidebarInset><DisplaySettingsProvider>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex min-w-0 items-center gap-1"><SidebarTrigger className="size-11 md:hidden" /><LayoutSwitcher /></div>
          <DisplayMenu />
        </div>
        <main className="p-6"><div>
          <h1 className="mb-1 text-2xl font-semibold">Today</h1>
          <p className="mb-4 text-sm text-muted-foreground">2 tasks</p>
          <ViewSwitcher tasks={baselineTasks} events={baselineEvents}
            listView={<TodayView tasks={baselineTasks} events={baselineEvents} />}
            calendarView={<TodayScheduleView tasks={baselineTasks} events={baselineEvents} />} />
        </div></main>
      </DisplaySettingsProvider></SidebarInset>
    </KeyboardProvider></SidebarProvider>
  </RambleProvider></SmartDateRecognitionProvider>;
}
