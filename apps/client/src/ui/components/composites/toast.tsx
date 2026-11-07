import { Toast } from "@base-ui/react/toast";
import { CircleAlert, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { buttonVariants, usePortalLayerContainer } from "../primitives";

/** A toast queue usable outside React (the query cache's error handler adds to it). */
const createToastManager = Toast.createToastManager;
type ToastManager = ReturnType<typeof createToastManager>;

/**
 * The toaster: one per app root (main.tsx), plus one per /ui gallery pane.
 * Base UI handles the accessibility: the viewport is a polite live region
 * (high-priority toasts are announced as alerts), F6 moves focus into it, Tab
 * reaches Retry and Dismiss, Escape dismisses the focused toast, and timers
 * pause while it is hovered or focused.
 */
function Toaster({ manager, className }: { manager: ToastManager; className?: string }) {
  const container = usePortalLayerContainer();
  return <Toast.Provider toastManager={manager} limit={3} timeout={8000}>
    <Toast.Portal container={container}>
      <Toast.Viewport data-slot="toast-viewport" className={cn("ui fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col-reverse gap-2 outline-none", className)}>
        <Toasts />
      </Toast.Viewport>
    </Toast.Portal>
  </Toast.Provider>;
}

function Toasts() {
  const { toasts } = Toast.useToastManager();
  return toasts.map(toast => <Toast.Root key={toast.id} toast={toast} data-slot="toast"
    className="rounded-xl border border-border bg-popover text-popover-foreground shadow-popover outline-none transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-ring data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
    <Toast.Content className="grid grid-cols-[auto_1fr_auto] items-start gap-x-2 gap-y-1 p-3">
      {toast.type === "error" && <CircleAlert aria-hidden className="mt-0.5 size-4 text-destructive" />}
      <div className={cn("flex min-w-0 flex-col gap-0.5", toast.type !== "error" && "col-span-2")}>
        <Toast.Title className="text-sm font-semibold text-foreground" />
        <Toast.Description className="text-xs-plus text-muted-foreground" />
        {toast.actionProps && <Toast.Action className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1.5 self-start")} />}
      </div>
      <Toast.Close aria-label="Dismiss" className={buttonVariants({ variant: "ghost", size: "icon-xs" })}><X /></Toast.Close>
    </Toast.Content>
  </Toast.Root>);
}

export { Toaster, createToastManager, type ToastManager };
