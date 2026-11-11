import type { ReactNode } from "react";
import type { Platform as HelpPlatform } from "../lib/platform";
import { PlatformSwitcher } from "./platform-switcher";

export type PlatformContentProps = { on: HelpPlatform; children: ReactNode; className?: string };

/**
 * One platform's variant, shown as a card headed by the platform selector. Every variant
 * stays in the HTML; CSS hides the ones not chosen. All selectors share the global choice.
 */
export function PlatformContent({ on, children, className }: PlatformContentProps) {
  return <div data-platform-content={on} className={`platform-block ${className ?? ""}`.trim()}>
    <PlatformSwitcher />
    {children}
  </div>;
}

export { PlatformContent as Platform };
