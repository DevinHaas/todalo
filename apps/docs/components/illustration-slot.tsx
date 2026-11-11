// Decorative ink illustrations (see ILLUSTRATIONS.md). One near-black file per image; dark mode flips it in CSS.
export function Illustration({ src, compact = false, priority = false }: { src: string; compact?: boolean; priority?: boolean }) {
  return (
    <div className={`illustration${compact ? " compact" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized WebP; no optimiser needed */}
      <img src={src} alt="" width={800} height={533} loading={priority ? "eager" : "lazy"} decoding="async" />
    </div>
  );
}
