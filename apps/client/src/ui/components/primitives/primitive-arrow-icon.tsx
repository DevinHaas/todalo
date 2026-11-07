import { ChevronDownIcon } from "lucide-react";

import { cn } from "../../lib/utils";

type PrimitiveArrowDirection = "down" | "left" | "right" | "up";

const primitiveArrowDirectionClassName: Record<PrimitiveArrowDirection, string | undefined> = {
  down: undefined,
  left: "rotate-90",
  right: "-rotate-90",
  up: "rotate-180",
};

function PrimitiveArrowIcon({
  className,
  direction = "down",
  openClassName,
  ...props
}: React.ComponentProps<typeof ChevronDownIcon> & {
  direction?: PrimitiveArrowDirection;
  openClassName?: string;
}) {
  return (
    <ChevronDownIcon
      aria-hidden="true"
      data-slot="primitive-arrow-icon"
      className={cn(
        "pointer-events-none shrink-0 size-3.5 text-[color:color-mix(in_oklab,var(--color-foreground)_60%,transparent)] transition-transform duration-200 ease-out group-hover/button:text-[color:color-mix(in_oklab,var(--color-foreground)_90%,transparent)] group-active/button:text-[color:color-mix(in_oklab,var(--color-foreground)_90%,transparent)] group-aria-expanded/button:text-[color:color-mix(in_oklab,var(--color-foreground)_90%,transparent)] group-aria-pressed/button:text-[color:color-mix(in_oklab,var(--color-foreground)_90%,transparent)] group-data-open/button:text-[color:color-mix(in_oklab,var(--color-foreground)_90%,transparent)] group-data-popup-open/button:text-[color:color-mix(in_oklab,var(--color-foreground)_90%,transparent)] group-data-[state=open]/button:text-[color:color-mix(in_oklab,var(--color-foreground)_90%,transparent)]",
        primitiveArrowDirectionClassName[direction],
        openClassName,
        className,
      )}
      {...props}
    />
  );
}

export { PrimitiveArrowIcon, type PrimitiveArrowDirection };
