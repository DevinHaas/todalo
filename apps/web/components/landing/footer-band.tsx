"use client";

import { useEffect, useRef } from "react";
import { footerShaderDefaults, mountFooterShader } from "./footer-shader";

const INK = "#121211";

/**
 * The band between the closing CTA and the footer. The shader draws over a plain
 * gradient, which is also what shows without WebGL2. Tune it in the Toolcraft lab
 * (apps/client: footer.html) and paste the copied JSON over footerShaderDefaults.
 */
export function FooterBand() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => mountFooterShader(canvas.current!, () => footerShaderDefaults), []);
  return (
    <div aria-hidden className="relative max-md:!h-44" style={{ height: footerShaderDefaults.height, background: `linear-gradient(to bottom, #f5f4f1, ${INK})` }}>
      <canvas ref={canvas} className="absolute inset-0 size-full opacity-0 transition-opacity duration-700" />
    </div>
  );
}

/**
 * Goes inside the footer. At the end of the page iOS 26 Safari fills the strip under its toolbar
 * with the color of a fixed element on the bottom edge, else the body's white, which cut the dark
 * footer off with a white band. This fixed strip in the footer's ink is there only while the
 * footer is on screen (the footer then covers the bottom edge, so the strip blends in); mid-page it
 * would tint the toolbar dark. Tested on the iOS 26 simulator: Safari skips a 1px strip and one
 * hidden behind the page, so it's 8px and on top, inside the bottom row's 24px padding.
 */
export function FooterChin() {
  const line = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = line.current!;
    const observer = new IntersectionObserver(([entry]) => (el.hidden = !entry.isIntersecting));
    observer.observe(el.parentElement!);
    return () => observer.disconnect();
  }, []);
  return <div ref={line} hidden aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 h-2" style={{ background: INK }} />;
}
