import type { ReactNode } from "react";
import { Icon } from "./icons";

const CALLOUTS = {
  tip: { label: "Tip", icon: "lightbulb" },
  note: { label: "Note", icon: "info" },
  warning: { label: "Warning", icon: "alert" },
} as const;

export function Callout({ type = "note", title, children }: {
  type?: keyof typeof CALLOUTS;
  title?: string;
  children: ReactNode;
}) {
  const label = title ?? CALLOUTS[type].label;
  return (
    <aside className={`callout callout-${type}`} aria-label={label}>
      <Icon name={CALLOUTS[type].icon} size={20} className="callout-icon" />
      <p className="callout-title">{label}</p>
      <div className="callout-body">{children}</div>
    </aside>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol>{children}</ol>;
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
