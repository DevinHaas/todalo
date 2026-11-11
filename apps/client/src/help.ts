// Links to the help center. Every address comes from help-links.json, which the
// Mac app's `open_help` command (src-tauri/src/help.rs) embeds too: correct a
// URL or add an article there and both sides follow.
import { invoke, isTauri } from "@tauri-apps/api/core";
import links from "./help-links.json";

export type HelpArticle = keyof typeof links.articles;

/**
 * Anchor props for the help center home or one article. A new tab in the
 * browser; the Mac webview cannot open URLs, so there Rust opens the system
 * browser from the article's name, never from a URL.
 */
export function helpLink(article?: HelpArticle) {
  return {
    href: links.base + (article ? links.articles[article] : ""), target: "_blank", rel: "noreferrer",
    onClick: (click: { preventDefault(): void }) => {
      if (!isTauri()) return;
      click.preventDefault();
      void invoke("open_help", { article: article ?? null }).catch(() => {});
    },
  };
}
