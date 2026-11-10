// The member badge: the bonsai scene fills the card; the number, name and join date sit
// in the mist at the bottom, the wordmark and seal beside them. Pointer tilt and a soft
// sheen tie the card to the scene's motion. Fonts are the host's (see badge.module.css).
import { useEffect, useRef, type CSSProperties } from "react";
import { BADGE_COLORS, mountBadgeScene, type BadgeSceneParams } from "./badge-scene";
import type { BonsaiStyle } from "./bonsai";
import styles from "./badge.module.css";

/** "Member since June 2026" */
export const memberSince = (since: Date | string) =>
  `Member since ${new Date(since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;

export function BadgeCard({ member, name, since, founding = false, logo, style, params, width = 360, follow = "card" }: {
  member: number; name: string;
  /** when they joined; omitted, the line is left out */
  since?: Date | string;
  /** shows the Founding member pill */
  founding?: boolean;
  /** URL of todalo-logo.svg, for the seal */
  logo: string;
  style?: BonsaiStyle; params: BadgeSceneParams; width?: number | string;
  /** "page": the tree and tilt follow the pointer anywhere on the page, not only over the card */
  follow?: "card" | "page";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const number = useRef<HTMLDivElement>(null);
  const live = useRef(params);
  live.current = params;
  useEffect(() => mountBadgeScene(canvas.current!, { member, style, params: () => live.current, label: () => number.current, follow: follow === "page" ? window : undefined }), [member, style, follow]);

  const tilt = (e: { clientX: number; clientY: number }) => {
    const rect = card.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const x = clamp((e.clientX - rect.left) / rect.width), y = clamp((e.clientY - rect.top) / rect.height);
    card.current!.style.setProperty("--tx", `${(x - 0.5) * 7}deg`);
    card.current!.style.setProperty("--ty", `${(0.5 - y) * 7}deg`);
    card.current!.style.setProperty("--mx", `${x * 100}%`);
    card.current!.style.setProperty("--my", `${y * 100}%`);
  };
  const untilt = () => { card.current!.style.setProperty("--tx", "0deg"); card.current!.style.setProperty("--ty", "0deg"); };
  useEffect(() => {
    if (follow !== "page") return;
    const root = document.documentElement;
    window.addEventListener("pointermove", tilt);
    root.addEventListener("pointerleave", untilt);
    return () => { window.removeEventListener("pointermove", tilt); root.removeEventListener("pointerleave", untilt); };
  }, [follow]);
  const colors = params.dark ? BADGE_COLORS.dark : BADGE_COLORS.light;

  return <div className={styles.stage} style={{ width }}
    onPointerMove={follow === "card" ? tilt : undefined} onPointerLeave={follow === "card" ? untilt : undefined}>
    <div ref={card} className={styles.card} data-dark={params.dark || undefined} data-number={params.number}
      style={{ background: colors.paper, color: colors.ink } as CSSProperties}>
      <canvas ref={canvas} className={styles.canvas} aria-hidden />
      <div className={styles.sheen} aria-hidden />
      {founding && <div className={styles.founding}>Founding member</div>}
      <div className={styles.meta}>
        <div>
          <div ref={number} className={styles.number}>#{String(member).padStart(4, "0")}</div>
          <div className={styles.name}>{name}</div>
          {since && <div className={styles.since}>{memberSince(since)}</div>}
        </div>
        <div className={styles.mark}>
          {params.accent === "seal" && <span className={styles.seal} aria-hidden style={{ background: BADGE_COLORS.red, "--paper": colors.paper, "--logo": `url(${logo})` } as CSSProperties} />}
          <span className={styles.wordmark}>todalo</span>
        </div>
      </div>
    </div>
  </div>;
}
