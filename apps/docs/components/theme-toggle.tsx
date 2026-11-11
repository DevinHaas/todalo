"use client";

import { THEME_KEY } from "@/lib/theme";

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="cursor-pointer text-sm text-ink/70 underline-offset-4 hover:text-ink hover:underline"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        try {
          localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
        } catch {
          // Storage blocked: the choice still holds for this page view.
        }
      }}
    >
      {/* Both labels are in the markup; CSS shows the one for the other theme,
          so the server render needs no knowledge of the visitor's theme. */}
      <span className="dark:hidden">Dark mode</span>
      <span className="hidden dark:inline">Light mode</span>
    </button>
  );
}
