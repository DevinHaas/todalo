import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The theme's own font sizes (theme.css --text-2xs, --text-xs-plus). Unknown to
// tailwind-merge, `text-xs-plus` read as a text colour and dropped a button's
// `text-[color:…]`: primary buttons drew their icons dark on brand red.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["2xs", "xs-plus"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
