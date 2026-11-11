import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

// Sanela (Envato, web-licensed), copied from apps/web. Headings only; it has
// two weights and no italic.
const sanela = localFont({
  src: [
    { path: "./fonts/sanela/SANELA-Thin.woff2", weight: "100", style: "normal" },
    { path: "./fonts/sanela/SANELA-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-sanela",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Todalo Help", template: "%s | Todalo Help" },
  description: "Guides and answers for Todalo on the web and on Mac.",
  icons: { icon: "/todalo-logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the script below sets the `dark` class before React hydrates.
    <html lang="en" className={`${geist.variable} ${sanela.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col bg-paper font-sans text-ink antialiased">
        <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-2xl font-black tracking-[-0.01em]">
            Todalo <span className="font-thin">Help</span>
          </Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
