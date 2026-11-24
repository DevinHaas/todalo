// Settings › Appearance › Custom CSS (advanced): the account's own stylesheet. It only
// restyles the account's own screens, but it must never make a network request (a shared
// theme could leak what is on screen through attribute selectors and remote images), so
// it is sanitized before every use. The sanitizer tokenizes like a browser (CSS Syntax 3:
// strings, comments, escapes, url tokens) and drops each declaration or rule that could
// load something: when unsure, it drops.
import type { CustomCssDto } from "../../../packages/server/src/personalization-dto";

export const CUSTOM_CSS_STYLE_ID = "todalo-custom-css";
/** The sanitized CSS for public/theme.js to paint before the first frame (same key there). */
export const CUSTOM_CSS_KEY = "todalo-custom-css";
/** The keyboard command (keyboard-screens.tsx) asks PersonalizationSync to switch it. */
export const TOGGLE_CUSTOM_CSS_EVENT = "todalo:toggle-custom-css";

/** `?safe` in the address (any value) skips custom CSS for this load; public/theme.js reads it too. */
export const isSafeMode = (search: string) => new URLSearchParams(search).has("safe");
export const SAFE_MODE = typeof location !== "undefined" && isSafeMode(location.search);

// ---- Tokens -----------------------------------------------------------------------

type Kind = "ws" | "ident" | "function" | "at" | "hash" | "string" | "url" | "bad-url" | "number" | "delim" | "cdo" | "cdc" | "(" | ")" | "[" | "]" | "{" | "}" | ";" | ":" | ",";
interface Token { kind: Kind; start: number; end: number; value: string }

const isHex = (c: string) => /^[0-9a-f]$/i.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9" && c.length === 1;
const isWs = (c: string) => c === " " || c === "\t" || c === "\n";
const nameStart = (c: string) => /^[a-z_]$/i.test(c) || c >= "\u0080";
const nameChar = (c: string) => nameStart(c) || /^[0-9-]$/.test(c);
const nonPrintable = (c: string) => /^[\x00-\x08\x0b\x0e-\x1f\x7f]$/.test(c);
const closer: Partial<Record<Kind, Kind>> = { function: ")", "(": ")", "[": "]", "{": "}" };

/**
 * Comments are skipped (not tokens); `value` is the decoded name, string or URL. Numbers
 * matter: in `1url(` the browser reads a unit, not a URL. `unicodeRange` reads `u+…` as
 * older engines did (one token), so the final check covers them too.
 */
function tokenize(css: string, unicodeRange = false): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const at = (n: number) => css[n] ?? "";
  const escapeAt = (n: number) => at(n) === "\\" && at(n + 1) !== "\n";
  const identAt = (n: number) => at(n) === "-" ? nameStart(at(n + 1)) || at(n + 1) === "-" || escapeAt(n + 1) : nameStart(at(n)) || escapeAt(n);
  const numberAt = (n: number) => at(n) === "+" || at(n) === "-" ? isDigit(at(n + 1)) || (at(n + 1) === "." && isDigit(at(n + 2))) : at(n) === "." ? isDigit(at(n + 1)) : isDigit(at(n));
  const digits = () => { while (isDigit(at(i))) i++; };
  // After a backslash: up to six hex digits (and one space), or the next character as is.
  const escape = () => {
    if (i >= css.length) return "\uFFFD";
    if (!isHex(at(i))) return css[i++]!;
    let digits = "";
    while (digits.length < 6 && isHex(at(i))) digits += css[i++];
    if (isWs(at(i))) i++;
    const code = parseInt(digits, 16);
    return code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff ? "\uFFFD" : String.fromCodePoint(code);
  };
  const name = () => {
    let out = "";
    for (;;) {
      if (nameChar(at(i))) out += css[i++];
      else if (escapeAt(i)) { i++; out += escape(); }
      else return out;
    }
  };
  const url = (): [Kind, string] => {
    let out = "";
    while (isWs(at(i))) i++;
    for (;;) {
      const c = at(i);
      if (c === "" || c === ")") { i = Math.min(i + 1, css.length); return ["url", out]; }
      if (isWs(c)) { while (isWs(at(i))) i++; if (at(i) === ")" || at(i) === "") continue; break; }
      if (c === '"' || c === "'" || c === "(" || nonPrintable(c) || (c === "\\" && !escapeAt(i))) break;
      if (c === "\\") { i++; out += escape(); } else { out += c; i++; }
    }
    // A bad URL runs to the next ")" (escapes included).
    while (i < css.length && css[i] !== ")") { if (escapeAt(i)) { i++; escape(); } else i++; }
    i = Math.min(i + 1, css.length);
    return ["bad-url", out];
  };
  while (i < css.length) {
    const start = i;
    const c = css[i]!;
    const push = (kind: Kind, value = "") => tokens.push({ kind, start, end: i, value });
    if (c === "/" && at(i + 1) === "*") { const end = css.indexOf("*/", i + 2); i = end < 0 ? css.length : end + 2; continue; }
    if (isWs(c)) { while (isWs(at(i))) i++; push("ws"); continue; }
    if (c === '"' || c === "'") {
      // A string ends at its quote, an unescaped newline (a bad string; the line goes on as CSS) or the end.
      let out = "";
      i++;
      while (i < css.length && css[i] !== c && css[i] !== "\n") {
        if (css[i] === "\\") { i++; if (at(i) === "\n") i++; else if (i < css.length) out += escape(); }
        else out += css[i++];
      }
      if (css[i] === c) i++;
      push("string", out);
      continue;
    }
    if (c === "#" && (nameChar(at(i + 1)) || escapeAt(i + 1))) { i++; push("hash", name()); continue; }
    if (numberAt(i)) {
      // A number, then a unit (a dimension) or "%".
      if (c === "+" || c === "-") i++;
      digits();
      if (at(i) === "." && isDigit(at(i + 1))) { i++; digits(); }
      if ((at(i) === "e" || at(i) === "E") && (isDigit(at(i + 1)) || ((at(i + 1) === "+" || at(i + 1) === "-") && isDigit(at(i + 2))))) { i += 2; digits(); }
      if (identAt(i)) name(); else if (at(i) === "%") i++;
      push("number");
      continue;
    }
    if (c === "<" && css.startsWith("<!--", i)) { i += 4; push("cdo"); continue; }
    if (c === "-" && css.startsWith("-->", i)) { i += 3; push("cdc"); continue; }
    if (unicodeRange && (c === "u" || c === "U") && at(i + 1) === "+" && (isHex(at(i + 2)) || at(i + 2) === "?")) {
      i += 2;
      let count = 0, wild = false;
      while (count < 6 && isHex(at(i))) { i++; count++; }
      while (count < 6 && at(i) === "?") { i++; count++; wild = true; }
      if (!wild && at(i) === "-" && isHex(at(i + 1))) { i++; for (count = 0; count < 6 && isHex(at(i)); count++) i++; }
      push("delim");
      continue;
    }
    if (identAt(i)) {
      const value = name();
      if (at(i) !== "(") { push("ident", value); continue; }
      i++;
      // url( without a quote is one token whose URL is read raw; url("…") is a function with a string.
      let peek = i;
      while (isWs(at(peek))) peek++;
      if (/^url$/i.test(value) && at(peek) !== '"' && at(peek) !== "'") { const [kind, link] = url(); push(kind, link); continue; }
      push("function", value);
      continue;
    }
    if (c === "@" && identAt(i + 1)) { i++; push("at", name()); continue; }
    i++;
    push(("()[]{};:,".includes(c) ? c : "delim") as Kind, c);
  }
  return tokens;
}

// ---- What may load something ------------------------------------------------------

/**
 * An image or font data: URL without a fragment (a fragment would make an SVG a document
 * reference for filter or clip-path, which may load more). Leading spaces and controls
 * are skipped as the URL parser does.
 */
const safeData = (link: string) => /^[\x00-\x20]*data:(image\/|font\/|application\/(x-)?font|application\/octet-stream)[^#]*$/i.test(link);
const imageFunctions = new Set(["image-set", "-webkit-image-set", "image", "cross-fade", "-webkit-cross-fade", "element", "-moz-element"]);
/** Functions that can't make a URL, so they may sit inside an image function (gradients, colours, maths, type()). */
const plainFunction = /^((-webkit-)?(repeating-)?(linear|radial|conic)-gradient|-webkit-gradient|rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|calc|min|max|clamp|type)$/;

/** Whether tokens [from, to) could load anything: a non-data URL, an @import, a string URL in an image function… */
function unsafe(tokens: Token[], from: number, to: number): boolean {
  const open: string[] = []; // function names (lowercase) or "" for a bracket, innermost last
  const opened: Kind[] = [];
  const inImage = () => open.some(name => imageFunctions.has(name));
  for (let n = from; n < to; n++) {
    const token = tokens[n]!;
    const name = token.value.toLowerCase();
    switch (token.kind) {
      case "bad-url": return true;
      case "url": if (!safeData(token.value)) return true; break;
      case "at": if (name === "import") return true; break;
      case "string": if (inImage() && open.at(-1) !== "type" && !safeData(token.value)) return true; break;
      case "function": {
        if (name === "url" || name === "src") {
          let first = n + 1;
          while (tokens[first]?.kind === "ws") first++;
          if (tokens[first]?.kind !== "string" || !safeData(tokens[first]!.value)) return true;
        }
        // var(), attr(), if()… in an image function could put any URL there.
        if (inImage() && !imageFunctions.has(name) && name !== "url" && name !== "src" && !plainFunction.test(name)) return true;
        // attr() typed as a URL.
        if (name === "attr") for (let m = n + 1; m < to && tokens[m]!.kind !== ")"; m++) if (/url/i.test(tokens[m]!.value)) return true;
        open.push(name); opened.push("function");
        break;
      }
      case "(": case "[": case "{": open.push(""); opened.push(token.kind); break;
      case ")": case "]": case "}": if (closer[opened.at(-1)!] === token.kind) { open.pop(); opened.pop(); } break;
    }
  }
  return false;
}

// ---- Sanitizing -------------------------------------------------------------------

/** Nested blocks deeper than this are judged as a whole (no deep recursion on hostile input). */
const MAX_DEPTH = 24;

/** One pass: drops every declaration, rule or at-rule with something unsafe in it. */
function dropUnsafe(css: string): { css: string; removed: number } {
  const tokens = tokenize(css);
  const kind = (n: number) => tokens[n]?.kind;
  // Each block's or function's matching closer; an unclosed one runs to the end, as in a browser.
  const match = new Array<number>(tokens.length).fill(-1);
  const stack: number[] = [];
  tokens.forEach((token, n) => {
    if (closer[token.kind]) stack.push(n);
    else if (stack.length && closer[tokens[stack.at(-1)!]!.kind] === token.kind) match[stack.pop()!] = n;
  });
  for (const n of stack) match[n] = tokens.length;
  /** Past one component value (a whole block or function). */
  const skip = (n: number) => Math.min(match[n]! >= 0 ? match[n]! + 1 : n + 1, tokens.length);
  const drops: [number, number][] = [];
  const drop = (from: number, to: number) => { if (to > from) drops.push([tokens[from]!.start, tokens[to - 1]!.end]); };

  // A rule's prelude up to its block, then the block's contents; `end` is the enclosing block's "}".
  const rule = (n: number, end: number, depth: number, stops: Kind[]) => {
    let m = n;
    while (m < end && kind(m) !== "{" && !stops.includes(kind(m)!)) m = skip(m);
    if (m >= end || kind(m) !== "{") { if (unsafe(tokens, n, m)) drop(n, m); return m; }
    const close = Math.min(match[m]!, end);
    const after = Math.min(close + 1, end);
    // A font face is kept only if nothing in it loads (its src is data: or local()).
    const whole = (kind(n) === "at" && tokens[n]!.value.toLowerCase() === "font-face") || depth >= MAX_DEPTH;
    if (unsafe(tokens, n, m) || (whole && unsafe(tokens, m, after))) drop(n, after);
    else if (!whole) contents(m + 1, close, depth + 1);
    return after;
  };
  // A block's contents (or the sheet's): at-rules, declarations and (nested) rules, as CSS Syntax 3 reads them.
  const contents = (n: number, end: number, depth: number) => {
    while (n < end) {
      const token = tokens[n]!;
      if (token.kind === "ws" || token.kind === ";" || token.kind === "cdo" || token.kind === "cdc") { n++; continue; }
      if (token.kind === "at") {
        // An at-rule ends at ";" or after its block.
        let m = n + 1;
        while (m < end && kind(m) !== ";" && kind(m) !== "{") m = skip(m);
        if (kind(m) === "{" && m < end && token.value.toLowerCase() !== "import") { n = rule(n, end, depth, []); continue; }
        const after = m < end && kind(m) === ";" ? m + 1 : Math.min(skip(m), end);
        if (unsafe(tokens, n, after)) drop(n, after);
        n = after;
        continue;
      }
      if (depth > 0 && token.kind === "ident") {
        // A declaration: name, ":", value up to ";"; a value with a {} block and more is a nested rule instead.
        let m = n + 1;
        while (kind(m) === "ws") m++;
        if (m < end && kind(m) === ":") {
          let v = m + 1, block = false, other = false;
          while (v < end && kind(v) !== ";" && !(block && other)) { if (kind(v) === "{") block = true; else if (kind(v) !== "ws") other = true; v = skip(v); }
          if (token.value.startsWith("--") || !(block && other)) {
            while (v < end && kind(v) !== ";") v = skip(v);
            const after = v < end ? v + 1 : v;
            if (unsafe(tokens, n, after)) drop(n, after);
            n = after;
            continue;
          }
        }
      }
      // A rule: nested ones also end (invalid) at ";".
      n = rule(n, end, depth, depth > 0 ? [";"] : []);
    }
  };
  contents(0, tokens.length, 0);
  let out = "", from = 0;
  for (const [start, end] of drops) { out += css.slice(from, start); from = end; }
  return { css: out + css.slice(from), removed: drops.length };
}

/**
 * Custom CSS that can't load anything: no @import, url() only for image and font data:
 * URLs, image-set() and friends only with those, @font-face only from data: (or local()),
 * and no "</style" to end the element early. `removed` counts what was dropped.
 */
export function sanitizeCss(input: string): { css: string; removed: number } {
  // As a browser reads it: one newline character, no NULs.
  let css = input.replace(/\r\n?|\f/g, "\n").replace(/\0/g, "\uFFFD");
  let removed = 0;
  for (let pass = 0; pass < 3; pass++) {
    const result = dropUnsafe(css);
    css = result.css.replace(/<\/(style)/gi, "<\\/$1");
    removed += result.removed;
    // What a drop left behind is read again as a whole (also as older engines tokenize): anything unsafe left means drop it all.
    if (![false, true].some(older => { const tokens = tokenize(css, older); return unsafe(tokens, 0, tokens.length); })) return { css, removed };
  }
  return { css: "", removed: removed + 1 };
}

// ---- Applying -----------------------------------------------------------------------

/**
 * Applies the account's custom CSS as one unlayered <style> at the end of <head> (after the
 * app's CSS, so it wins), or removes it; and remembers it for the next launch's first frame.
 * Safe mode skips it for this load but still remembers it.
 */
export function applyCustomCss(customCss: CustomCssDto | null, page: Document = document, safe = SAFE_MODE, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = globalThis.localStorage ?? null) {
  const css = customCss?.enabled ? sanitizeCss(customCss.css).css : "";
  try {
    if (!css) storage?.removeItem(CUSTOM_CSS_KEY);
    else if (storage?.getItem(CUSTOM_CSS_KEY) !== css) storage?.setItem(CUSTOM_CSS_KEY, css);
  } catch { /* not remembered */ }
  let style = page.getElementById(CUSTOM_CSS_STYLE_ID);
  if (safe || !css) { style?.remove(); return; }
  if (!style) { style = page.createElement("style"); style.id = CUSTOM_CSS_STYLE_ID; }
  if (style.textContent !== css) style.textContent = css;
  // Last in <head>, even after styles added since the first frame.
  if (style !== page.head.lastElementChild) page.head.append(style);
}
