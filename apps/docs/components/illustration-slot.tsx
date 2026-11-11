export function IllustrationSlot({ compact = false }: { compact?: boolean }) {
  return <div className={`illustration-slot${compact ? " compact" : ""}`} aria-hidden="true"><span /><span /><span /></div>;
}
