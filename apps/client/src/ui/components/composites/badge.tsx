import { cva, type VariantProps } from "class-variance-authority";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex h-[18px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap transition-all focus-visible:border-[color:var(--color-ring)] focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_oklab,var(--color-ring)_50%,transparent)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-[color:var(--color-destructive)] aria-invalid:ring-[color:color-mix(in_oklab,var(--color-destructive)_20%,transparent)] dark:aria-invalid:ring-[color:color-mix(in_oklab,var(--color-destructive)_40%,transparent)] [&>svg]:pointer-events-none [&>svg]:size-2.5!",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] [a]:hover:bg-[color:color-mix(in_oklab,var(--color-primary)_80%,transparent)]",
        secondary:
          "border-[color:var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-secondary)_12%,transparent)] text-[color:var(--color-secondary-foreground)] [a]:hover:bg-[color:color-mix(in_oklab,var(--color-secondary)_20%,transparent)]",
        warning:
          "border-[color:color-mix(in_oklab,var(--color-attention)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--color-attention)_15%,transparent)] text-[color:var(--color-attention)] [a]:hover:border-[color:color-mix(in_oklab,var(--color-attention)_60%,transparent)] [a]:hover:bg-[color:color-mix(in_oklab,var(--color-attention)_25%,transparent)] [a]:hover:text-[color:var(--color-attention)]",
        destructive:
          "border-[color:color-mix(in_oklab,var(--color-destructive)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--color-destructive)_15%,transparent)] text-[color:var(--color-destructive)] focus-visible:border-[color:var(--color-destructive)] focus-visible:ring-[color:color-mix(in_oklab,var(--color-destructive)_20%,transparent)] dark:focus-visible:ring-[color:color-mix(in_oklab,var(--color-destructive)_40%,transparent)] [a]:hover:border-[color:color-mix(in_oklab,var(--color-destructive)_60%,transparent)] [a]:hover:bg-[color:color-mix(in_oklab,var(--color-destructive)_25%,transparent)] [a]:hover:text-[color:var(--color-destructive)]",
        outline:
          "border-[color:var(--color-border)] bg-[color:var(--color-field)] text-[color:var(--color-foreground)] [a]:hover:!border-[color:var(--color-border-hover)] [a]:hover:bg-[color:var(--color-field-hover)] [a]:hover:text-[color:var(--color-foreground)]",
        emphasisOutline:
          "border-[color:var(--color-border)] bg-[color:var(--color-field)] text-[color:color-mix(in_oklab,var(--color-foreground)_80%,transparent)] [a]:hover:!border-[color:var(--color-border-hover)] [a]:hover:bg-[color:var(--color-field-hover)] [a]:hover:text-[color:color-mix(in_oklab,var(--color-foreground)_80%,transparent)]",
        mutedOutline:
          "border-[color:var(--color-border)] bg-[color:var(--color-field)] text-[color:color-mix(in_oklab,var(--color-foreground)_40%,transparent)] [a]:hover:!border-[color:var(--color-border-hover)] [a]:hover:bg-[color:var(--color-field-hover)] [a]:hover:text-[color:color-mix(in_oklab,var(--color-foreground)_40%,transparent)]",
        ghost:
          "hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-muted-foreground)] dark:hover:bg-[color:color-mix(in_oklab,var(--color-muted)_50%,transparent)]",
        link: "text-[color:var(--color-primary)] underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  children,
  className,
  shimmer = false,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    shimmer?: boolean;
  }) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
        children: shimmer ? (
          <span className="chat-thinking-shimmer-text">{children}</span>
        ) : (
          children
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
