import { sanitizeComposedHostProps, type SafeComposedHostElementProps } from "../primitives/sanitize-composed-host-props";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import {
} from "../primitives";

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border border-[color:var(--color-border)] px-2 py-1.5 text-left text-xs/relaxed has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-1.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-[color:var(--color-card)] text-[color:var(--color-card-foreground)]",
        destructive:
          "border-[color:color-mix(in_oklab,var(--color-destructive)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--color-destructive)_10%,transparent)] text-[color:var(--color-foreground)] [&>svg]:text-[color:var(--color-destructive)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: SafeComposedHostElementProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? undefined}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function AlertTitle({ className, ...props }: SafeComposedHostElementProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 group-data-[variant=destructive]/alert:text-[color:var(--color-destructive)] [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-[color:var(--color-foreground)]",
        className,
      )}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function AlertDescription({ className, ...props }: SafeComposedHostElementProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-xs/relaxed text-balance text-[color:var(--color-muted-foreground)] group-data-[variant=destructive]/alert:text-[color:color-mix(in_oklab,var(--color-destructive)_90%,transparent)] md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-[color:var(--color-foreground)] [&_p:not(:last-child)]:mb-4",
        className,
      )}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function AlertAction({ className, ...props }: SafeComposedHostElementProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-1.5 right-2", className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
