"use client";

import { useId } from "react";
import { PLATFORMS, PLATFORM_LABELS, isPlatform } from "../lib/platform";
import { Icon } from "./icons";
import { usePlatform } from "./platform-provider";

/**
 * "Select Platform:" with a select pill. Every instance reads and writes the one
 * global, remembered choice, so they stay in sync.
 */
export function PlatformSwitcher({ className = "platform-select" }: { className?: string }) {
  const { platform, setPlatform } = usePlatform();
  const id = useId();
  // ponytail: before hydration the select shows Web even when Mac is remembered (the content
  // itself is already right, via CSS). Render the options per platform if that flash matters.
  return (
    <div className={className}>
      <label htmlFor={id}>Select Platform:</label>
      <span className="select-pill">
        <select id={id} value={platform} onChange={(event) => isPlatform(event.target.value) && setPlatform(event.target.value)}>
          {PLATFORMS.map((choice) => <option key={choice} value={choice}>{PLATFORM_LABELS[choice]}</option>)}
        </select>
        <Icon name="chevron-down" />
      </span>
    </div>
  );
}
