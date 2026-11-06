// Software-keyboard accommodation for the shared shell (feasibility gate finding 2).
// iOS WKWebView keeps the layout viewport when the keyboard opens and only
// shrinks the visual viewport, so a short page has no room to scroll a focused
// field above the keyboard. The visible area is mirrored into CSS variables:
// `--keyboard-inset` pads the page (so it can scroll) and lifts fixed dialogs.

type View = Pick<VisualViewport, "height" | "offsetTop" | "addEventListener" | "removeEventListener">;

export function keyboardInset(innerHeight: number, view: Pick<VisualViewport, "height" | "offsetTop">) {
  // Below ~80px the change is browser chrome (or rounding), not a keyboard.
  const inset = Math.round(innerHeight - view.height - view.offsetTop);
  return inset > 80 ? inset : 0;
}

export function trackSoftwareKeyboard(view: View | null = window.visualViewport, root = document.documentElement) {
  if (!view) return () => {};
  let open = false;
  const update = () => {
    const inset = keyboardInset(window.innerHeight, view);
    root.style.setProperty("--keyboard-inset", `${inset}px`);
    const opened = inset > 0 && !open;
    open = inset > 0;
    // Once the page has room, bring the focused field above the keyboard.
    const field = document.activeElement;
    if (opened && field instanceof HTMLElement && field.matches("input, textarea, select")) {
      requestAnimationFrame(() => field.scrollIntoView({ block: "nearest" }));
    }
  };
  update();
  view.addEventListener("resize", update);
  view.addEventListener("scroll", update);
  return () => { view.removeEventListener("resize", update); view.removeEventListener("scroll", update); };
}

/**
 * Ref for a form that can unmount while one of its fields is focused: blurs the
 * field first. iOS otherwise leaves the keyboard's autocorrect bubble on screen
 * after the field is gone. (React 19 runs a ref's cleanup on detach.)
 */
export function releaseFocus(form: HTMLElement | null) {
  return () => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && form?.contains(focused)) focused.blur();
  };
}
