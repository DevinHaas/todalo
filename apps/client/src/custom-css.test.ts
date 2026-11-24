import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CUSTOM_CSS_KEY, CUSTOM_CSS_STYLE_ID, applyCustomCss, isSafeMode, sanitizeCss } from "./custom-css";
import { applyDesign, defaultDesign, designCss } from "./personalization";

const kept = (css: string) => sanitizeCss(css).css;

describe("custom CSS sanitizer", () => {
  it("keeps ordinary themes as written", () => {
    for (const css of [
      ":root { --color-brand: #6b5c1f; --font-sans: ui-monospace, Menlo, monospace; }\n:root.dark { --color-brand: #c9b46b; }",
      '[data-region="task-row"]::before { content: "> "; color: var(--color-muted-foreground); }',
      '[data-region="sidebar"] { background: linear-gradient(170deg, rgb(0 0 0 / .2), transparent); border-right: 1px solid var(--color-border); }',
      "@media (max-width: 767px) { [data-region=\"toolbar\"] { padding: 0 .5rem; } }",
      ".a { color: red; &:hover { color: blue; } .b & { color: green } }",
      "@supports (backdrop-filter: blur(1px)) { @layer mine { .x { backdrop-filter: blur(8px) } } }",
      '[href^="https://"]::after { content: "url(https://example.com)" }', // a URL in a string is only text
      '@font-face { font-family: Mine; src: local("Menlo"), url("data:font/woff2;base64,d09GMgAB") format("woff2"); }',
      "@keyframes blink { 50% { opacity: 0 } }",
      ".x { background-image: url(data:image/png;base64,iVBORw0KGgo=), url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E'); }",
      '.x { background-image: image-set("data:image/png;base64,AAAA" 1x, url(data:image/png;base64,BBBB) 2x type("image/png")); }',
      "/* a comment with url(https://example.com/x.png) inside */ .x { color: red }",
    ]) expect(sanitizeCss(css)).toEqual({ css, removed: 0 });
  });

  // Each row: one attack and what must survive around it.
  const blocked: [string, string, string][] = [
    ["@import", '@import url("https://evil.example/x.css");\n.a { color: red }', "\n.a { color: red }"],
    ["@import string", "@import 'https://evil.example/x.css' screen; .a { color: red }", " .a { color: red }"],
    ["@import with escapes", "@\\69mport url(x.css); .a{}", " .a{}"],
    ["@import in uppercase, nested", ".a { @IMPORT 'x.css'; color: red }", ".a {  color: red }"],
    ["@import data: CSS", "@import url(data:text/css,a{b:url(https://evil.example)});", ""],
    ["unquoted url", ".a { color: red; background: url(https://evil.example/x.png); }", ".a { color: red;  }"],
    ["quoted url", ".a { background: url( 'https://evil.example/x' ) }", ".a { }"],
    ["relative url", ".a { list-style: url(icon.png) }", ".a { }"],
    ["protocol-relative url", ".a { cursor: url(//evil.example/c.cur), auto }", ".a { }"],
    ["fragment url", ".a { filter: url(#f) }", ".a { }"],
    ["empty url", ".a { background: url() }", ".a { }"],
    ["url in uppercase", ".a { background: URL(https://evil.example) }", ".a { }"],
    ["escaped url( function", ".a { background: \\75 rl(https://evil.example) }", ".a { }"],
    ["escaped url( mid-name", ".a { background: u\\72l(https://evil.example) }", ".a { }"],
    ["escapes inside the URL", ".a { background: url(\\68ttps://evil.example) }", ".a { }"],
    ["comment inside url()", ".a { background: url(/*x*/https://evil.example) }", ".a { }"],
    ["comment splitting the declaration", ".a { background:/**/url(https://evil.example) }", ".a { }"],
    ["spaced scheme", '.a { background: url("data :image/png,x") }', ".a { }"],
    ["non-breaking space before data:", '.a { background: url(" data:image/png,x") }', ".a { }"],
    ["data: HTML", '.a { background: url("data:text/html,<img src=https://evil.example>") }', ".a { }"],
    ["data: SVG reference", ".a { filter: url(\"data:image/svg+xml,<svg><filter id='f'><feImage href='https://evil.example'/></filter></svg>#f\") }", ".a { }"],
    ["bad url", ".a { background: url(https://evil.example/a b) }", ".a { }"],
    ["url in a custom property", ":root { --x: url(https://evil.example); --y: red }", ":root {  --y: red }"],
    ["url in a custom property block", ":root { --x: { a: url(https://evil.example) }; }", ":root {  }"],
    ["src()", ".a { background: src(\"https://evil.example\") }", ".a { }"],
    ["src() with var()", ".a { background: src(var(--x)) }", ".a { }"],
    ["image-set string", '.a { background: image-set("https://evil.example/x.png" 1x) }', ".a { }"],
    ["-webkit-image-set string", ".a { background: -webkit-image-set('x.png' 1x, url(data:image/png,a) 2x) }", ".a { }"],
    ["image-set with var()", ".a { background: image-set(var(--u) 1x) }", ".a { }"],
    ["image-set with if()", '.a { background: image-set(if(style(--x: 1): "https://evil.example"; else: "data:image/png,a") 1x) }', ".a { }"],
    ["image() fallback string", '.a { background: image("https://evil.example/x.png") }', ".a { }"],
    ["cross-fade()", '.a { background: cross-fade("https://evil.example" 50%, red) }', ".a { }"],
    ["attr() as a URL", ".a { background: attr(data-src type(<url>)) }", ".a { }"],
    ["@font-face from the network", "@font-face { font-family: X; src: url(https://evil.example/x.woff2) } .a { color: red }", " .a { color: red }"],
    ["@font-face mixing data: and remote", '@font-face { font-family: X; src: url("data:font/woff2;base64,AA"), url(x.woff) }', ""],
    ["url in a selector-led rule", ".a:is(url(https://evil.example)) { color: red } .b {}", " .b {}"],
    ["url in an at-rule prelude", "@media url(https://evil.example) { .a { color: red } }", ""],
    ["url in a nested rule", ".a { .b { background: url(x) } color: red }", ".a { .b { } color: red }"],
    ["string hiding a comment start", '.a { content: "/*"; background: url(https://evil.example); content: "*/" }', '.a { content: "/*";  content: "*/" }'],
    // The bad string ends at the newline; the declaration runs on to ";", url and all.
    ["newline ends a string", '.a { content: "x\nbackground: url(https://evil.example); }', ".a {  }"],
    // Older engines read u+abcdef as one token, so "url(" after it is a real URL there: nothing survives.
    ["url after a unicode range (older engines)", ".a{x:u+abcdefurl(https://evil.example)}", ""],
    ["CDO before url(", "<!--url(https://evil.example) .a{}", "<!--"],
    // "1url" is a unit, so the browser sees the comment and then the real url(): it must go.
    ["number then a comment start in a url-looking unit", '.a{b:1url(data:image/png,/*);c:"*/);background:url(https://evil.example/x);"}', '.a{b:1url(data:image/png,/*);c:"*/);"}'],
  ];
  it.each(blocked)("drops %s", (_name, css, safe) => {
    const result = sanitizeCss(css);
    expect(result.css).toBe(safe);
    expect(result.removed).toBeGreaterThan(0);
    expect(result.css).not.toMatch(/evil\.example/);
  });

  it("can't be ended early with </style", () => {
    expect(kept('.a::after { content: "</style><script>alert(1)</script>" }')).toBe('.a::after { content: "<\\/style><script>alert(1)</script>" }');
    expect(kept("</STYLE >")).not.toMatch(/<\/style/i);
  });

  it("drops everything when a pass can't make it safe, and survives deep nesting", () => {
    const deep = `${"a{".repeat(5000)}b{background:url(https://evil.example)}${"}".repeat(5000)}`;
    expect(kept(deep)).not.toMatch(/evil/);
    const parens = `.a{x:${"(".repeat(20000)}}`;
    expect(sanitizeCss(parens).removed).toBe(0);
  });

  it("normalises newlines as a browser does", () => {
    expect(kept(".a { content: 'x\r\nbackground: url(https://evil.example)' }")).not.toMatch(/evil/);
    expect(kept(".a { content: 'x\fbackground: url(https://evil.example)' }")).not.toMatch(/evil/);
  });
});

/** Just enough of a document for <style> elements in <head>. */
function page() {
  const nodes: { id: string; textContent: string | null; remove: () => void }[] = [];
  const head = {
    get lastElementChild() { return nodes.at(-1) ?? null; },
    append(node: (typeof nodes)[number]) { const at = nodes.indexOf(node); if (at >= 0) nodes.splice(at, 1); nodes.push(node); },
    appendChild(node: (typeof nodes)[number]) { head.append(node); },
  };
  const doc = {
    head, nodes,
    getElementById: (id: string) => nodes.find(node => node.id === id) ?? null,
    createElement: () => { const node = { id: "", textContent: null as string | null, remove: () => { const at = nodes.indexOf(node); if (at >= 0) nodes.splice(at, 1); } }; return node; },
  };
  return doc;
}
const memory = (entries: Record<string, string> = {}) => {
  const values = new Map(Object.entries(entries));
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
};

describe("applying custom CSS", () => {
  const theme = { css: ":root { --color-brand: red } .a { background: url(https://evil.example) }", enabled: true };

  it("adds one sanitized, unlayered style last in <head> and remembers it for the first frame", () => {
    const doc = page(), storage = memory();
    doc.head.append({ id: "app-css", textContent: "", remove: () => {} });
    applyCustomCss(theme, doc as never, false, storage);
    const style = doc.getElementById(CUSTOM_CSS_STYLE_ID)!;
    expect(style.textContent).toBe(":root { --color-brand: red } .a { }");
    expect(doc.head.lastElementChild).toBe(style);
    expect(storage.values.get(CUSTOM_CSS_KEY)).toBe(style.textContent);
    // Styles added later (a lazy chunk): applying again moves it back to the end.
    doc.head.append({ id: "late", textContent: "", remove: () => {} });
    applyCustomCss(theme, doc as never, false, storage);
    expect(doc.head.lastElementChild).toBe(style);
    expect(doc.nodes.filter(node => node.id === CUSTOM_CSS_STYLE_ID)).toHaveLength(1);
  });

  it("removes it when turned off or removed, and forgets it", () => {
    for (const off of [{ ...theme, enabled: false }, null]) {
      const doc = page(), storage = memory();
      applyCustomCss(theme, doc as never, false, storage);
      applyCustomCss(off, doc as never, false, storage);
      expect(doc.getElementById(CUSTOM_CSS_STYLE_ID)).toBeNull();
      expect(storage.values.has(CUSTOM_CSS_KEY)).toBe(false);
    }
  });

  it("skips it in safe mode, but keeps it for the next normal load", () => {
    const doc = page(), storage = memory();
    applyCustomCss(theme, doc as never, true, storage);
    expect(doc.getElementById(CUSTOM_CSS_STYLE_ID)).toBeNull();
    expect(storage.values.get(CUSTOM_CSS_KEY)).toContain("--color-brand: red");
    for (const search of ["?safe", "?safe=1", "?x=1&safe"]) expect(isSafeMode(search)).toBe(true);
    for (const search of ["", "?safety=1", "?x=safe"]) expect(isSafeMode(search)).toBe(false);
  });
});

describe("first paint (public/theme.js)", () => {
  const script = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");
  const run = (storage: ReturnType<typeof memory>, search = "") => {
    const doc = page();
    const attributes = new Set<string>();
    const root = { classList: { toggle: () => {} }, setAttribute: (name: string) => void attributes.add(name) };
    new Function("document", "localStorage", "matchMedia", "location", script)({ ...doc, documentElement: root }, storage, () => ({ matches: false }), { search });
    return { doc, attributes };
  };
  const design = { "--color-brand": "#4f7a55", "--design-sidebar": "linear-gradient(red, blue)" };

  it("paints the design in its layer, as applyDesign does, then the custom CSS last", () => {
    const { doc, attributes } = run(memory({ "todalo-design": JSON.stringify(design), [CUSTOM_CSS_KEY]: ":root{--color-brand:red}" }));
    expect(doc.getElementById("todalo-design")!.textContent).toBe(designCss(design));
    expect(doc.head.lastElementChild!.id).toBe(CUSTOM_CSS_STYLE_ID);
    expect(doc.head.lastElementChild!.textContent).toBe(":root{--color-brand:red}");
    expect(attributes.has("data-design")).toBe(true);
  });

  it("skips the custom CSS with ?safe", () => {
    const { doc } = run(memory({ [CUSTOM_CSS_KEY]: ":root{--color-brand:red}" }), "?safe");
    expect(doc.getElementById(CUSTOM_CSS_STYLE_ID)).toBeNull();
  });
});

describe("design cascade", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts the design's variables in the design layer, never inline on <html>, so custom CSS beats them", () => {
    const doc = page();
    const inline = new Map<string, string>([["--color-brand", "stale, from an older theme.js"]]);
    const root = {
      ownerDocument: doc, classList: { contains: () => false }, toggleAttribute: () => {},
      style: { setProperty: (prop: string, value: string) => void inline.set(prop, value), removeProperty: (prop: string) => void inline.delete(prop) },
    };
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    vi.stubGlobal("localStorage", memory());
    applyDesign({ ...defaultDesign, accent: "#4f7a55", corners: "sharp" }, root as never);
    expect([...inline.keys()]).toEqual([]);
    const css = doc.getElementById("todalo-design")!.textContent!;
    expect(css.startsWith("@layer legacy, theme, design, base, components, utilities;@layer design{:root{")).toBe(true);
    expect(css).toContain("--color-brand:#4f7a55");
    expect(css).toContain("--design-corners:0");
    // The same order as the app's stylesheet declares.
    expect(readFileSync(new URL("./ui/styles.css", import.meta.url), "utf8")).toContain("@layer legacy, theme, design, base, components, utilities;");
  });
});
