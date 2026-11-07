"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { toggleSelectedItemClassName } from "./selection-state";
import { cn } from "../../lib/utils";

const toggleVariants = cva(
  `group/toggle inline-flex cursor-pointer items-center justify-center gap-1 rounded-md text-xs font-medium whitespace-nowrap transition-all outline-none hover:bg-[color:color-mix(in_oklab,var(--color-foreground)_10%,transparent)] hover:text-[color:var(--color-foreground)] focus-visible:border-[color:var(--color-ring)] focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_oklab,var(--color-ring)_50%,transparent)] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-[color:var(--color-destructive)] aria-invalid:ring-[color:color-mix(in_oklab,var(--color-destructive)_20%,transparent)] ${toggleSelectedItemClassName} dark:aria-invalid:ring-[color:color-mix(in_oklab,var(--color-destructive)_40%,transparent)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5`,
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-[color:color-mix(in_oklab,var(--color-foreground)_72%,transparent)]",
        outline: `border border-[color:var(--color-border)] bg-[color:var(--color-field)] text-[color:color-mix(in_oklab,var(--color-foreground)_72%,transparent)] hover:bg-[color:color-mix(in_oklab,var(--color-foreground)_10%,transparent)] hover:text-[color:var(--color-foreground)] ${toggleSelectedItemClassName} aria-pressed:hover:bg-[color:var(--color-selected)] aria-pressed:hover:text-[color:var(--color-foreground)] data-[pressed]:hover:bg-[color:var(--color-selected)] data-[pressed]:hover:text-[color:var(--color-foreground)] data-[state=on]:hover:bg-[color:var(--color-selected)] data-[state=on]:hover:text-[color:var(--color-foreground)]`,
      },
      size: {
        default: "h-7 min-w-7 px-2",
        sm: "h-6 min-w-6 rounded-[min(var(--radius-md),8px)] px-1.5 text-[0.625rem] [&_svg:not([class*='size-'])]:size-3",
        lg: "h-8 min-w-8 px-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
