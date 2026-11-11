// The static search index. Generated blocks (ShortcutTable, ReleaseNotes) are
// spelled out as text, so their contents are searchable like any article body.
import { categories } from "./categories";
import type { Content } from "./content-model";
import { releaseDate, releases } from "./releases";
import { shortcutGroups } from "./shortcuts";

const generated: Record<string, () => string> = {
  ShortcutTable: () => shortcutGroups().map(({ group, rows }) =>
    [group, ...rows.map((row) => `${row.label}: ${row.mac.map((steps) => steps.join(" then ")).join(" or ")}`)].join("\n")).join("\n\n"),
  ReleaseNotes: () => releases.map((release) =>
    [`Version ${release.version}`, releaseDate(release.date), release.title, ...release.highlights, ...(release.changes ?? [])]
      .filter(Boolean).join("\n")).join("\n\n"),
};

export function searchIndex(content: Pick<Content, "search">) {
  return content.search.map((article) => ({
    title: article.title,
    description: article.description,
    url: article.url,
    content: article.content.replace(/<(ShortcutTable|ReleaseNotes)\s*\/>/g, (_tag, name: string) => generated[name]()),
    breadcrumbs: [categories.find((category) => category.slug === article.category)!.name],
  }));
}
