// Injected into every harness page before the app (addInitScript). Records trusted input times,
// Event Timing entries (INP-style input delay + processing + presentation) and long tasks, and
// exposes window.__perf.until(): input → first frame after a DOM condition holds.
(() => {
  const inputs = [], events = [], longtasks = [];
  let lcp = 0;
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, e => { if (e.isTrusted) inputs.push(e.timeStamp); }, true);
  const observe = (type, push, extra = {}) => { try { new PerformanceObserver(list => push(list.getEntries())).observe({ type, buffered: true, ...extra }); } catch { /* unsupported */ } };
  observe("event", entries => events.push(...entries), { durationThreshold: 16 });
  observe("longtask", entries => longtasks.push(...entries));
  observe("largest-contentful-paint", entries => { lcp = entries.at(-1).startTime; });
  const frame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

  window.__perf = {
    now: () => performance.now(),
    /** Resolves once `source` (a JS expression) is true, after the first trusted input since `since` (or from `since` when input is false). */
    until(source, { since = 0, input = true, timeout = 20000 } = {}) {
      const cond = new Function(`return (${source})`);
      return new Promise((resolve, reject) => {
        let done = false, raf = 0, timer = 0;
        const stop = () => { done = true; observer.disconnect(); cancelAnimationFrame(raf); clearTimeout(timer); };
        const check = () => {
          if (done) return;
          const from = input ? inputs.find(at => at > since) : since;
          if (from === undefined) return;
          let ok = false; try { ok = Boolean(cond()); } catch { /* not yet */ }
          if (!ok) return;
          stop();
          const dom = performance.now();
          void frame().then(() => resolve({ dom: dom - from, ms: performance.now() - from, at: performance.timeOrigin + performance.now(), inputAt: performance.timeOrigin + from }));
        };
        const observer = new MutationObserver(check);
        observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
        const loop = () => { check(); if (!done) raf = requestAnimationFrame(loop); };
        timer = setTimeout(() => { stop(); reject(new Error(`timeout: ${source}`)); }, timeout);
        loop();
      });
    },
    stats(since) {
      const ev = events.filter(e => e.startTime >= since), lt = longtasks.filter(e => e.startTime >= since);
      return { inp: ev.reduce((max, e) => Math.max(max, e.duration), 0), tbt: lt.reduce((sum, e) => sum + Math.max(0, e.duration - 50), 0), longtasks: lt.length };
    },
    load() {
      const nav = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      const kb = (filter) => Math.round(resources.filter(filter).reduce((sum, e) => sum + (e.transferSize || 0), 0) / 1024);
      const api = resources.filter(e => e.name.includes("/api/")).map(e => ({ path: new URL(e.name).pathname, start: Math.round(e.startTime), end: Math.round(e.responseEnd) }));
      return {
        ttfb: nav ? nav.responseStart : 0, dcl: nav ? nav.domContentLoadedEventEnd : 0,
        fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0, lcp,
        jsKB: kb(e => e.initiatorType === "script" || /\.js(\?|$)/.test(e.name)), cssKB: kb(e => /\.css(\?|$)/.test(e.name)),
        apiCount: api.length, api, domNodes: document.getElementsByTagName("*").length,
        tbt: longtasks.reduce((sum, e) => sum + Math.max(0, e.duration - 50), 0),
      };
    },
    /** Scrolls the list's scroller `px` per frame for `frames` frames; returns frame-time stats. */
    async scroll(selector, frames = 120, px = 80) {
      let el = document.querySelector(selector);
      while (el && !(el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      const scroller = el ?? document.scrollingElement;
      scroller.scrollTop = 0; await frame();
      const deltas = []; let last = performance.now();
      for (let i = 0; i < frames; i++) {
        scroller.scrollTop += (i < frames / 2 ? px : -px);
        await new Promise(requestAnimationFrame);
        const now = performance.now(); deltas.push(now - last); last = now;
      }
      deltas.sort((a, b) => a - b);
      return { p50: deltas[Math.floor(deltas.length / 2)], p95: deltas[Math.floor(deltas.length * 0.95)], max: deltas.at(-1), janky: deltas.filter(d => d > 20).length, frames, scroller: scroller.className || scroller.tagName };
    },
  };
})();
