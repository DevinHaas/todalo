import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { snapToCenter } from "./quick-add";

const KEY = "todalo.quick-add.offset";
/** The quick add's offset from its default spot, as fractions of the viewport so it survives window resizes. */
type Offset = { x: number; y: number };

function load(): Offset {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (value && typeof value === "object" && "x" in value && "y" in value && typeof value.x === "number" && typeof value.y === "number") return { x: value.x, y: value.y };
  } catch { /* unreadable: default spot */ }
  return { x: 0, y: 0 };
}

/**
 * ⌘-drag repositions the quick add anywhere (Raycast-style): its center snaps
 * onto the viewport's center lines. Horizontally centered shows dotted guides
 * along its left and right edges; vertically centered, a dotted center line.
 * Offset via `position: relative` (not a transform), so the composer's
 * absolutely positioned popovers keep their anchors. The spot is remembered.
 */
export function useCommandDrag() {
  const [offset, setOffset] = useState(load);
  const [guides, setGuides] = useState<{ vertical: boolean; horizontal: boolean; width: number } | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!event.metaKey || event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    const box = target.getBoundingClientRect();
    const from = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const pointer = { x: event.clientX, y: event.clientY };
    const start = offset;
    let latest = offset;
    target.setPointerCapture(event.pointerId);
    const move = (moved: PointerEvent) => {
      const snapped = snapToCenter({ x: from.x + moved.clientX - pointer.x, y: from.y + moved.clientY - pointer.y }, { width: innerWidth, height: innerHeight });
      latest = { x: start.x + (snapped.x - from.x) / innerWidth, y: start.y + (snapped.y - from.y) / innerHeight };
      setOffset(latest); setGuides({ ...snapped, width: box.width });
    };
    const end = () => {
      target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end);
      setGuides(null);
      localStorage.setItem(KEY, JSON.stringify(latest));
    };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
  }

  const style: CSSProperties = { position: "relative", left: `${offset.x * 100}vw`, top: `${offset.y * 100}vh` };
  const lines = guides && <>
    {guides.vertical && [-1, 1].map(side => <div key={side} className="snap-guide vertical" aria-hidden="true" style={{ left: `calc(50% + ${side * guides.width / 2}px)` }} />)}
    {guides.horizontal && <div className="snap-guide horizontal" aria-hidden="true" />}
  </>;
  return { style, onPointerDown, guides: lines, dragging: guides !== null };
}
