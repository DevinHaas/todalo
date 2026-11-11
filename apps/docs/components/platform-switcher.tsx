"use client";

import { PLATFORMS, PLATFORM_LABELS } from "../lib/platform";
import { usePlatform } from "./platform-provider";

export type PlatformSwitcherProps = { hasPlatformContent: boolean; className?: string };

export function PlatformSwitcher({ hasPlatformContent, className }: PlatformSwitcherProps) {
  const { platform, setPlatform } = usePlatform();
  if (!hasPlatformContent) return null;
  return (
    <div role="group" aria-label="Platform" className={className}>
      <div className="inline-flex gap-1 rounded-lg border border-ink/15 bg-paper p-1">
        {PLATFORMS.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={platform === choice}
            data-platform-choice={choice}
            className="cursor-pointer rounded-md border border-transparent px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            onClick={() => setPlatform(choice)}
          >
            {PLATFORM_LABELS[choice]}
          </button>
        ))}
      </div>
    </div>
  );
}
