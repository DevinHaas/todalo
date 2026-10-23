// usage: osascript -l JavaScript apps/client/scripts/mac-ax.js [fill:idx:text|press:label|key:return|wait:s|dump]...
function run(argv) {
  const se = Application('System Events'); const p = se.processes.whose({ name: { _contains: 'todalo' } })[0]; p.frontmost = true;
  const all = () => p.windows[0].entireContents();
  const s = v => { try { return v == null ? '' : String(v); } catch (e) { return ''; } };
  const out = [];
  for (const a of argv) {
    const [cmd, x, ...rest] = a.split(':'); const y = rest.join(':');
    if (cmd === 'fill') { const f = all().filter(e => s(e.role()) === 'AXTextField'); f[+x].focused = true; delay(0.2); se.keystroke('a', { using: 'command down' }); se.keystroke(y); }
    else if (cmd === 'press') { const b = all().find(e => s(e.role()) === 'AXButton' && (s(e.title()) + s(e.description()) + s(e.name())).includes(x)); if (!b) out.push('NO BUTTON ' + x); else b.actions['AXPress'].perform(); }
    else if (cmd === 'key') se.keyCode(x === 'return' ? 36 : x === 'escape' ? 53 : +x);
    else if (cmd === 'type') se.keystroke(x);
    else if (cmd === 'wait') delay(+x);
    else if (cmd === 'dump') for (const e of all()) { const r = s(e.role()); if (!['AXStaticText', 'AXButton', 'AXTextField', 'AXHeading', 'AXLink', 'AXCheckBox'].includes(r)) continue; const t = [s(e.value()), s(e.title()), s(e.description())].filter(Boolean).join(' | '); if (t) out.push(r.slice(2) + ': ' + t); }
  }
  return out.join('\n');
}
