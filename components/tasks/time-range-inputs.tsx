"use client";

import { Input } from "@/components/ui/input";

// Only rendered once a due date is picked — leaving both empty keeps the
// task all-day.
export function TimeRangeInputs({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
}: {
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="time"
        value={startTime}
        onChange={(e) => onStartTimeChange(e.target.value)}
        className="w-auto"
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="time"
        value={endTime}
        onChange={(e) => onEndTimeChange(e.target.value)}
        className="w-auto"
      />
    </div>
  );
}
