import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { categories } from "./categories";
import { loadContent } from "./content-loader";
import { buildContent } from "./content-model";
import { articleSchema } from "./schema";

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function site(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "todalo-help-"));
  roots.push(root);
  mkdirSync(join(root, "content"));
  mkdirSync(join(root, "public"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { dir: join(root, "content"), publicDir: join(root, "public") };
}

function article(fields: Record<string, unknown> = {}, body = "Body text.") {
  const data = {
    title: "Use Quick Add",
    description: "Capture a task in one line.",
    category: "tasks-capture",
    order: 1,
    platforms: ["web", "mac"],
    related: [],
    published: true,
    ...fields,
  };
  const yaml = Object.entries(data).filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${yaml.join("\n")}\n---\n\n${body}\n`;
}

it("returns a published article with its details and address", () => {
  const content = loadContent(site({ "content/tasks-capture/use-quick-add.mdx": article() }));

  expect(content.articles).toHaveLength(1);
  expect(content.articles[0]).toMatchObject({
    slug: "use-quick-add",
    category: "tasks-capture",
    url: "/tasks-capture/use-quick-add",
    title: "Use Quick Add",
    description: "Capture a task in one line.",
    order: 1,
    platforms: ["web", "mac"],
    related: [],
    published: true,
  });
  expect(content.articles[0].body).toContain("Body text.");
  expect(content.article("/tasks-capture/use-quick-add")).toBe(content.articles[0]);
});

describe("publication boundary", () => {
  function mixedSite() {
    return site({
      "content/tasks-capture/published.mdx": article(),
      "content/tasks-capture/draft.mdx": article({ published: false, order: 2 }),
      "content/coach/hidden.mdx": article({ category: "coach", published: false }),
    });
  }

  it("filters lists, lookups, search and sitemap through the same boundary", () => {
    const content = loadContent(mixedSite());
    expect(content.articles.map((entry) => entry.slug)).toEqual(["published"]);
    expect(content.categories.map((category) => category.slug)).toEqual(["tasks-capture"]);
    expect(content.category("coach")).toBeUndefined();
    expect(content.article("/tasks-capture/draft")).toBeUndefined();
    expect(content.category("tasks-capture")?.articles).toEqual(content.articles);
    expect(content.search.map((entry) => entry.url)).toEqual(["/tasks-capture/published"]);
    expect(content.sitemap.map((entry) => entry.url)).toEqual(["/", "/tasks-capture", "/tasks-capture/published"]);
  });

  it("supports explicit and environment local preview", () => {
    const options = mixedSite();
    expect(loadContent({ ...options, preview: true }).articles).toHaveLength(3);
    vi.stubEnv("DOCS_PREVIEW", "true");
    const content = loadContent(options);
    expect(content.preview).toBe(true);
    expect(content.category("coach")?.articles).toHaveLength(1);
    expect(content.article("/tasks-capture/draft")).toBeDefined();
    expect(content.search).toHaveLength(3);
    expect(content.sitemap).toHaveLength(6);
    expect(loadContent({ ...options, preview: false }).articles).toHaveLength(1);
  });

  it("never previews production, even when both preview switches request drafts", () => {
    const options = mixedSite();
    vi.stubEnv("DOCS_PREVIEW", "true");
    const preview = loadContent({ ...options, preview: true });
    vi.stubEnv("NODE_ENV", "production");
    for (const content of [
      loadContent({ ...options, preview: true, environment: "development" }),
      buildContent(preview.articles, { preview: true }),
    ]) {
      expect(content.preview).toBe(false);
      expect(content.articles).toHaveLength(1);
      expect(content.category("coach")).toBeUndefined();
      expect(JSON.stringify(content)).not.toContain("hidden");
      expect(JSON.stringify(content)).not.toContain('"/tasks-capture/draft"');
    }
  });

  it("honours an explicit production validation environment", () => {
    expect(loadContent({ ...mixedSite(), preview: true, environment: "production" }).articles).toHaveLength(1);
  });

  it("orders categories by the declaration and articles by order then slug", () => {
    const content = loadContent(site({
      "content/coach/first.mdx": article({ category: "coach" }),
      "content/tasks-capture/zebra.mdx": article({ order: 2 }),
      "content/tasks-capture/alpha.mdx": article({ order: 2 }),
      "content/tasks-capture/first.mdx": article(),
    }));
    expect(content.articles.map((entry) => entry.slug)).toEqual(["first", "alpha", "zebra", "first"]);
    expect(content.categories.map((category) => category.slug)).toEqual(["tasks-capture", "coach"]);
  });
});

describe("frontmatter and address integrity", () => {
  it.each(["title", "description", "category", "order", "platforms", "related", "published"])(
    "requires %s even on a draft", (field) => {
      expect(() => loadContent(site({
        "content/tasks-capture/draft.mdx": article({ published: false, [field]: undefined }),
      }))).toThrow(/invalid frontmatter/);
    },
  );

  it.each([
    { title: " " }, { description: " " }, { category: "unknown" }, { order: 0 }, { order: -1 },
    { order: 1.5 }, { platforms: [] }, { platforms: ["android"] }, { platforms: ["web", "web"] },
    { related: ["not-an-address"] }, { related: ["/coach/first", "/coach/first"] },
    { related: Array.from({ length: 5 }, (_, index) => `/coach/article-${index}`) },
    { badge: "beta" }, { published: "false" },
  ])("rejects invalid metadata %j", (fields) => {
    expect(() => loadContent(site({ "content/tasks-capture/example.mdx": article(fields) }))).toThrow(/invalid frontmatter/);
  });

  it("accepts iOS in the schema without publishing iOS drafts", () => {
    const content = loadContent(site({ "content/tasks-capture/example.mdx": article({ platforms: ["ios"] }) }));
    expect(articleSchema.parse(content.articles[0]).platforms).toEqual(["ios"]);
  });

  it.each(["Bad-slug", "bad_slug", "bad--slug", "-bad", "bad-", "nested/article", "index/nested/example"])(
    "rejects malformed article paths %s", (slug) => {
      expect(() => loadContent(site({ [`content/tasks-capture/${slug}.mdx`]: article() }))).toThrow(/slug/);
    },
  );

  it("rejects duplicate canonical addresses regardless of extension", () => {
    expect(() => loadContent(site({
      "content/tasks-capture/example.md": article(), "content/tasks-capture/example.mdx": article(),
    }))).toThrow(/duplicate article URL/);
  });

  it("rejects mismatched categories and undeclared directory categories", () => {
    expect(() => loadContent(site({ "content/coach/example.mdx": article() }))).toThrow(/category must match/);
    expect(() => loadContent(site({ "content/unknown/example.mdx": article({ category: "unknown" }) }))).toThrow(/invalid frontmatter/);
  });

  it("rejects symlinks in the content tree", () => {
    const options = site({ "content/tasks-capture/example.mdx": article() });
    symlinkSync(join(options.dir, "tasks-capture/example.mdx"), join(options.dir, "alias.mdx"));
    expect(() => loadContent(options)).toThrow(/symlink/);
  });
});

describe("article references", () => {
  function linked(body: string, fields: Record<string, unknown> = {}, assets: Record<string, string> = {}) {
    return site({
      "content/tasks-capture/source.mdx": article(fields, body),
      "content/tasks-capture/target.mdx": article({ order: 2 }, "## Add a task\n\n## Add a task\n\n## Personal [#custom]\n\n## Café\n\n<a id=\"named\" />"),
      ...assets,
    });
  }

  it("resolves absolute, relative, reference and JSX links with actual Fumadocs heading IDs", () => {
    const options = linked(`
[Home](/) [Category](/tasks-capture/) [Task](target.mdx#add-a-task)
[Duplicate](./target#add-a-task-1) [Custom](/tasks-capture/target#custom)
[Unicode](target#caf%C3%A9) [Named](target#named)
[Same host](https://help.todalo.app/tasks-capture/target?view=web#custom)
[Reference][target] [External](https://example.com/missing) [Mail](mailto:support@todalo.app)
<a href="/tasks-capture/target#add-a-task">Task</a>
<Link href={'/tasks-capture/target#custom'}>Task</Link>

[target]: /tasks-capture/target#custom

## Local

[Here](#local)
`, { related: ["/tasks-capture/target"] });
    expect(loadContent(options).articles).toHaveLength(2);
  });

  it("ignores links and images shown in code examples and MDX comments", () => {
    expect(loadContent(linked('`[Broken](/missing/article)`\n\n```mdx\n<img src="/missing.png" />\n```\n\n{/* <a href="/missing/article">example</a> */}')).articles).toHaveLength(2);
  });

  it.each([
    "[Missing](/tasks-capture/missing)", "[Anchor](target#absent)",
    "[Category](/coach)", "[Home anchor](/#absent)",
    '<Link href="/tasks-capture/missing">Missing</Link>',
    "<Link href={destination}>Dynamic</Link>",
  ])("rejects broken or unverifiable links: %s", (body) => {
    expect(() => loadContent(linked(body))).toThrow(/missing|unverifiable|static string/);
  });

  it("rejects repeated custom anchors", () => {
    expect(() => loadContent(linked("## First [#same]\n\n## Second [#same]"))).toThrow(/duplicate anchor/);
  });

  it.each([false, true])("never lets public articles link or relate to drafts in preview=%s", (preview) => {
    for (const [body, fields] of [["[Draft](draft)", {}], ["Body", { related: ["/tasks-capture/draft"] }]] as const) {
      const options = site({
        "content/tasks-capture/source.mdx": article(fields, body),
        "content/tasks-capture/draft.mdx": article({ published: false }),
      });
      expect(() => loadContent({ ...options, preview })).toThrow(/unpublished/);
    }
  });

  it("does not expose a draft-only category through public links in preview", () => {
    expect(() => loadContent({ ...site({
      "content/tasks-capture/source.mdx": article({}, "[Coach](/coach)"),
      "content/coach/draft.mdx": article({ published: false, category: "coach" }),
    }), preview: true })).toThrow(/missing or unpublished/);
  });

  it("permits draft-to-draft links only in local preview", () => {
    const options = site({
      "content/tasks-capture/source.mdx": article({ published: false, related: ["/tasks-capture/target"] }, "[Draft](target#title)"),
      "content/tasks-capture/target.mdx": article({ published: false }, "## Title"),
    });
    expect(loadContent(options).articles).toHaveLength(0);
    expect(loadContent({ ...options, preview: true }).articles).toHaveLength(2);
  });

  it("validates draft bodies only when previewing them", () => {
    const options = site({ "content/tasks-capture/draft.mdx": article({ published: false }, "[Broken](/missing/article)") });
    expect(loadContent(options).articles).toEqual([]);
    expect(() => loadContent({ ...options, preview: true })).toThrow(/missing/);
  });

  it.each([["/tasks-capture/source"], ["/coach/absent"]])("rejects invalid related articles %j", (...related) => {
    expect(() => loadContent(linked("Body", { related }))).toThrow(/itself|missing/);
  });

  it("resolves markdown, reference and JSX images plus themed screenshots", () => {
    const options = linked(`
![Task](/images/task.png)
![Reference][shot]
<Image src={'/images/task.png'} alt="Task" />
<ThemedScreenshot light="/screenshots/task-light.png" dark="/screenshots/task-dark.png" alt="Task" width={800} height={600} />

[shot]: /screenshots/task-light.png
`, {}, { "public/images/task.png": "image", "public/screenshots/task-light.png": "light", "public/screenshots/task-dark.png": "dark" });
    expect(loadContent(options).articles).toHaveLength(2);
  });

  it.each([
    '![Missing](/images/missing.png)', '<Image src="/images/missing.png" />', '<Image src={image} />',
    '![Missing][shot]\n\n[shot]: /images/missing.png',
    '<ThemedScreenshot light="/images/light.png" />',
    '<ThemedScreenshot light="/images/light.png" dark="/images/light.png" />',
    '<ThemedScreenshot light="/images/light.png" dark="/images/missing.png" />',
    '![Single theme](/screenshots/task-light.png)', '![Unpaired](/screenshots/task.png)',
    '![Traversal](/../outside.png)', '![Remote](https://example.com/photo.png)',
  ])("rejects missing, unpaired or unsafe image references: %s", (body) => {
    expect(() => loadContent(linked(body, {}, {
      "public/images/light.png": "light", "public/screenshots/task-light.png": "light",
      "public/screenshots/task.png": "image", "outside.png": "outside",
    }))).toThrow(/image|screenshot|static string/);
  });

  it("rejects a symlink escaping public even if the referenced file exists", () => {
    const options = linked('![Escape](/escaped.png)', {}, { "outside.png": "outside" });
    symlinkSync(join(dirname(options.publicDir), "outside.png"), join(options.publicDir, "escaped.png"));
    expect(() => loadContent(options)).toThrow(/unsafe image/);
  });
});

describe("git update metadata", () => {
  it("uses no invented date for an untracked article", () => {
    const content = loadContent(site({ "content/tasks-capture/example.mdx": article() }));
    expect(content.articles[0].updatedAt).toBeNull();
  });

  it("reads dates from the build manifest when there is no git history", () => {
    const content = loadContent(site({
      "content/tasks-capture/example.mdx": article(),
      ".article-dates": "tasks-capture/example.mdx\t2026-03-04T05:06:07+01:00\nother/missing.mdx\tnot-a-date\n",
    }));
    expect(content.articles[0].updatedAt).toBe("2026-03-04T04:06:07.000Z");
  });

  it("uses the latest article commit", () => {
    const options = site({ "content/tasks-capture/example.mdx": article() });
    const root = dirname(options.dir);
    const git = (args: string[], date?: string, author = "Devin Hasler") => execFileSync("git", args, {
      cwd: root, stdio: "pipe", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: "docs@example.com", GIT_COMMITTER_NAME: author,
        GIT_COMMITTER_EMAIL: "docs@example.com", GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
    git(["init"]);
    git(["add", "."]);
    git(["-c", "commit.gpgsign=false", "commit", "-m", "Article"], "2026-01-02T12:00:00Z");
    expect(loadContent(options).articles[0].updatedAt).toBe("2026-01-02T12:00:00.000Z");
    writeFileSync(join(options.dir, "tasks-capture/example.mdx"), article({}, "Revised body."));
    git(["add", "."]);
    git(["-c", "commit.gpgsign=false", "commit", "-m", "Revise article"], "2026-02-03T15:30:00Z", "Alex Writer");
    expect(loadContent(options).articles[0].updatedAt).toBe("2026-02-03T15:30:00.000Z");
  });
});

describe("real help-center content", () => {
  it("declares seven ordered categories and keeps every unreviewed stub private", () => {
    const content = loadContent({ preview: false });
    expect(categories.map((category) => category.name)).toEqual([
      "Get started", "Tasks & capture", "Organise & views", "Goals, seasons & rituals", "Coach", "Integrations", "Apps & account",
    ]);
    expect(categories.map((category) => category.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(categories.map((category) => category.slug)).size).toBe(7);
    expect(content.articles).toEqual([]);
    expect(content.categories).toEqual([]);
    expect(content.search).toEqual([]);
    expect(content.sitemap).toEqual([{ url: "/", updatedAt: null }]);
  });

  it("loads all 40 explicitly named spec topics as complete, uniquely addressed drafts", () => {
    const content = loadContent({ preview: true });
    expect(content.articles).toHaveLength(40);
    expect(content.categories.map((category) => category.articles.length)).toEqual([5, 9, 8, 5, 4, 2, 7]);
    expect(new Set(content.articles.map((entry) => entry.url)).size).toBe(40);
    for (const category of content.categories) {
      expect(category.articles.map((entry) => entry.order)).toEqual(category.articles.map((_, index) => index + 1));
      for (const entry of category.articles) {
        expect(articleSchema.safeParse(entry).success).toBe(true);
        expect(entry.published).toBe(false);
        expect(entry.url).toMatch(/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(entry.category).toBe(category.slug);
        expect(entry.slug).not.toBe("placeholder");
      }
    }
    expect(content.category("coach")?.articles.every((entry) => entry.badge === "experiment")).toBe(true);
    expect(content.article("/apps-account/allow-notifications-and-the-microphone-on-mac")?.platforms).toEqual(["mac"]);
    expect(content.articles.map((entry) => entry.title)).toContain("What's new");
  });
});
