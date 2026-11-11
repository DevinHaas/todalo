import type { ReactNode } from "react";
import type { Platform as HelpPlatform } from "../lib/platform";

export type PlatformContentProps = { on: HelpPlatform; children: ReactNode; className?: string };

export function PlatformContent({ on, children, className }: PlatformContentProps) {
  return <div data-platform-content={on} className={className}>{children}</div>;
}

export { PlatformContent as Platform };
