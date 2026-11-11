import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { HelpSearchProvider, SearchTrigger } from "@/components/help-search";
import { PlatformProvider } from "@/components/platform-provider";
import { loadContent } from "@/lib/content";
import { categories } from "@/lib/categories";
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
  metadataBase: new URL("https://help.todalo.app"),
  title: { default: "Todalo Help", template: "%s | Todalo Help" },
  description: "Guides and answers for Todalo on the web and on Mac.",
  icons: { icon: "/todalo-logo.svg" },
  openGraph: { siteName: "Todalo Help", type: "website", locale: "en_US" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = loadContent();
  const articles = content.articles.map((article) => ({
    url: article.url, title: article.title, description: article.description,
    category: categories.find((category) => category.slug === article.category)?.name ?? article.category,
  }));
  return (
    // suppressHydrationWarning: the script below sets the `dark` class before React hydrates.
    <html lang="en" className={`${geist.variable} ${sanela.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col bg-paper font-sans text-ink antialiased">
        <PlatformProvider><HelpSearchProvider articles={articles}>
        <a href="#main-content" className="skip-link">Skip to content</a>
        {content.preview && <div className="preview-banner" role="status">Local draft preview · Unpublished guides are visible here only.</div>}
        <header className="site-header">
          <Link href="/" className="font-display text-2xl font-black tracking-[-0.01em]">
            Todalo <span className="font-thin">Help</span>
          </Link>
          <nav aria-label="Help center"><SearchTrigger className="header-search">Search help</SearchTrigger><ThemeToggle /></nav>
        </header>
        <main id="main-content" className="site-main">{children}</main>
        <Footer />
        </HelpSearchProvider></PlatformProvider>
      </body>
    </html>
  );
}
