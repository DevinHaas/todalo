import type { ReactNode } from "react";

export function Callout({ type = "note", title, children }: {
  type?: "tip" | "note" | "warning";
  title?: string;
  children: ReactNode;
}) {
  const label = title ?? { tip: "Tip", note: "Note", warning: "Warning" }[type];
  return <aside className={`callout callout-${type}`} aria-label={label}><p className="callout-title">{label}</p><div>{children}</div></aside>;
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="article-steps">{children}</ol>;
}

export function Step({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

export function Tip({ children }: { children: ReactNode }) {
  return <Callout type="tip">{children}</Callout>;
}

export function Note({ children }: { children: ReactNode }) {
  return <Callout type="note">{children}</Callout>;
}

export function Warning({ children }: { children: ReactNode }) {
  return <Callout type="warning">{children}</Callout>;
}
