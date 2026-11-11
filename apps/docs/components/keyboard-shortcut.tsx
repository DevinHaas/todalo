import { keyLabel } from "../lib/platform";

export type ShortcutProps = { keys: string; className?: string };

export function Shortcut({ keys, className }: ShortcutProps) {
  return (
    <span className={className}>
      {(["mac", "ctrl"] as const).map((style) => {
        const label = keyLabel(keys, style);
        const description = label.replaceAll("⌃", "Control+").replaceAll("⌥", "Option+").replaceAll("⇧", "Shift+").replaceAll("⌘", "Command+");
        return (
          <kbd
            key={style}
            data-key-style-content={style}
            aria-label={description}
            className="rounded border border-ink/20 bg-ink/5 px-1.5 py-0.5 font-mono text-sm"
          >
            {label}
          </kbd>
        );
      })}
    </span>
  );
}

export { Shortcut as Kbd };
