"use client";

import { useEffect } from "react";

/**
 * Feeds the pointer position over a brand button (.landing-cta) into --mx/--my (0..1),
 * which globals.css turns into a glow that leans away from the cursor and a light that
 * follows it. One delegated listener for the whole page.
 */
export function CtaGlow() {
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const el = (event.target as Element | null)?.closest?.<HTMLElement>(".landing-cta");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", ((event.clientX - r.left) / r.width).toFixed(3));
      el.style.setProperty("--my", ((event.clientY - r.top) / r.height).toFixed(3));
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);
  return null;
}
