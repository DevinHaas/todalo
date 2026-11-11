import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadContent } from "./content-loader";
import { releases } from "./releases";
import { searchIndex } from "./search";
import { shortcutGroups } from "./shortcuts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function site(articles: Record<string, { published: boolean; body: string }>) {
  const root = mkdtempSync(join(tmpdir(), "todalo-search-"));
  roots.push(root);
  mkdirSync(join(root, "public"));
  for (const [slug, { published, body }] of Object.entries(articles)) {
    mkdirSync(join(root, "content/apps-account"), { recursive: true });
    writeFileSync(join(root, `content/apps-account/${slug}.mdx`), `---\ntitle: ${slug}\ndescription: About ${slug}.\ncategory: apps-account\norder: 1\nplatforms: [web]\nrelated: []\npublished: ${published}\n---\n\n${body}\n`);
  }
  return { dir: join(root, "content"), publicDir: join(root, "public") };
}

it("indexes the generated shortcut table and release notes as article text", () => {
  const index = searchIndex(loadContent(site({
    shortcuts: { published: true, body: "Intro.\n\n<ShortcutTable />" },
    news: { published: true, body: "<ReleaseNotes />" },
  })));
  const text = (url: string) => index.find((entry) => entry.url === url)!.content;
  const row = shortcutGroups()[0].rows[0];
  expect(text("/apps-account/shortcuts")).toContain("Intro.");
  expect(text("/apps-account/shortcuts")).toContain(row.label);
  expect(text("/apps-account/shortcuts")).not.toContain("<ShortcutTable");
  expect(text("/apps-account/news")).toContain(releases[0].highlights[0]);
  expect(text("/apps-account/news")).toContain(`Version ${releases[0].version}`);
  expect(index[0].breadcrumbs).toEqual(["Apps & account"]);
});

it("leaves unpublished articles out, generated text included", () => {
  const index = searchIndex(loadContent(site({
    visible: { published: true, body: "Hello." },
    draft: { published: false, body: "<ReleaseNotes />" },
  })));
  expect(index.map((entry) => entry.url)).toEqual(["/apps-account/visible"]);
  expect(JSON.stringify(index)).not.toContain(releases[0].highlights[0]);
});
