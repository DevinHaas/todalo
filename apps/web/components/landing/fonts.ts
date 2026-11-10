import localFont from "next/font/local";

// Sanela (Envato, web-licensed). Landing headlines only: Black for the
// statement, Thin for the answer line. Geist stays for everything else.
export const sanela = localFont({
  src: [
    { path: "../../app/fonts/sanela/SANELA-Thin.woff2", weight: "100", style: "normal" },
    { path: "../../app/fonts/sanela/SANELA-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-sanela",
  display: "swap",
});
