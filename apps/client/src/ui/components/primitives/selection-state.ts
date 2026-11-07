/** Shared image/cover selection outline; leaves the image itself unmodified. */
export const selectedImageOutlineClassName =
  "data-[selected=true]:outline data-[selected=true]:outline-[1px] data-[selected=true]:outline-offset-2 data-[selected=true]:outline-[color:var(--color-link)] data-[selected=true]:[outline-style:solid]";

export const selectedItemSurfaceClassName =
  "bg-[color:var(--color-selected)]";

export const selectedItemBorderClassName =
  "border-[color:var(--color-border)]";

export const importantSelectedItemSurfaceClassName =
  "!bg-[color:var(--color-selected)]";

export const importantSelectedItemBorderClassName =
  "!border-[color:var(--color-border)]";

export const hoverImportantSelectedItemSurfaceClassName =
  "hover:!bg-[color:var(--color-selected)]";

export const hoverImportantSelectedItemBorderClassName =
  "hover:!border-[color:var(--color-border)]";

export const selectedItemTextClassName = "text-[color:var(--color-foreground)]";

export const pressedSelectedItemClassName =
  "aria-pressed:border-[color:var(--color-border)] aria-pressed:bg-[color:var(--color-selected)] aria-pressed:text-[color:var(--color-foreground)] data-[pressed]:border-[color:var(--color-border)] data-[pressed]:bg-[color:var(--color-selected)] data-[pressed]:text-[color:var(--color-foreground)]";

export const toggleSelectedItemClassName =
  "aria-pressed:border-[color:var(--color-border)] aria-pressed:bg-[color:var(--color-selected)] aria-pressed:text-[color:var(--color-foreground)] data-[pressed]:border-[color:var(--color-border)] data-[pressed]:bg-[color:var(--color-selected)] data-[pressed]:text-[color:var(--color-foreground)] data-[state=on]:border-[color:var(--color-border)] data-[state=on]:bg-[color:var(--color-selected)] data-[state=on]:text-[color:var(--color-foreground)]";

export const activeSelectedItemClassName =
  "data-active:border-[color:var(--color-border)] data-active:bg-[color:var(--color-selected)] data-active:text-[color:var(--color-foreground)]";

export const checkedSelectedItemClassName =
  "data-checked:border-[color:var(--color-border)] data-checked:bg-[color:var(--color-selected)] data-checked:text-[color:var(--color-foreground)] dark:data-checked:bg-[color:var(--color-selected)]";
