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
