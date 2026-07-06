"use client";

import { createContext, useContext, useState } from "react";
import { LayoutGrid, CalendarDays, List, HelpCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const LAYOUTS = [
  { key: "list", label: "List", icon: List },
  { key: "board", label: "Board", icon: LayoutGrid },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
] as const;

export type Layout = (typeof LAYOUTS)[number]["key"];

type DisplaySettings = {
  layout: Layout;
  setLayout: (layout: Layout) => void;
  showCompleted: boolean;
  setShowCompleted: (value: boolean) => void;
};

const DisplaySettingsContext = createContext<DisplaySettings | null>(null);

export function DisplaySettingsProvider({ children }: { children: React.ReactNode }) {
  const [layout, setLayout] = useState<Layout>("list");
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <DisplaySettingsContext.Provider value={{ layout, setLayout, showCompleted, setShowCompleted }}>
      {children}
    </DisplaySettingsContext.Provider>
  );
}

export function useDisplaySettings() {
  const ctx = useContext(DisplaySettingsContext);
  if (!ctx) throw new Error("useDisplaySettings must be used within DisplaySettingsProvider");
  return ctx;
}

// ponytail: Sort/Filter selects below are visual stubs copied from Todoist's
// Display modal — no grouping/sorting/priority/label/assignee data model
// exists yet, so each is fixed to its single real option. Wire up for real
// once those concepts exist.
function StubRow({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <Select defaultValue={value}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
      {children}
      <ChevronDown className="size-4" />
    </div>
  );
}

export function DisplayMenu() {
  const { layout, setLayout, showCompleted, setShowCompleted } = useDisplaySettings();

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <List className="size-4" />
            Display
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle>Layout</DialogTitle>
          <HelpCircle className="size-4 text-muted-foreground" />
        </DialogHeader>

        <div className="flex gap-1 rounded-md border p-1">
          {LAYOUTS.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={layout === key ? "secondary" : "ghost"}
              className="flex-1"
              onClick={() => setLayout(key)}
            >
              <Icon className="size-4" />
              {label}
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm">Completed tasks</span>
          <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
        </div>

        <SectionHeader>Sort</SectionHeader>
        <div className="space-y-3">
          <StubRow label="Grouping" value="None" options={["None"]} />
          <StubRow label="Sorting" value="Smart" options={["Smart"]} />
        </div>

        <SectionHeader>Filter</SectionHeader>
        <div className="space-y-3">
          <StubRow label="Assignee" value="Me and unassigned" options={["Me and unassigned"]} />
          <StubRow label="Deadline" value="All" options={["All"]} />
          <StubRow label="Priority" value="All" options={["All"]} />
          <StubRow label="Label" value="All" options={["All"]} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
