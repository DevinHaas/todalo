import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { CheckIcon } from "lucide-react";

import { cn } from "../../lib/utils";

export interface Swatch<Value extends string> { value: Value; label: string; color: string }

/**
 * A fixed palette as a radio group of colour dots (arrow keys move, Space picks).
 * For free colours use ColorControl; this is for app palettes like goal colours.
 */
function SwatchPicker<Value extends string>({ swatches, value, onValueChange, className, ...props }: {
  swatches: readonly Swatch<Value>[]; value: Value; onValueChange(value: Value): void;
} & Omit<RadioGroupPrimitive.Props, "value" | "onValueChange" | "defaultValue">) {
  return (
    <RadioGroupPrimitive data-slot="swatch-picker" value={value} onValueChange={(next) => onValueChange(next as Value)}
      className={cn("flex flex-wrap gap-1.5", className)} {...props}>
      {swatches.map((swatch) => (
        <RadioPrimitive.Root key={swatch.value} value={swatch.value} aria-label={swatch.label} title={swatch.label}
          data-slot="swatch" style={{ backgroundColor: swatch.color }}
          className="grid size-6 cursor-pointer place-content-center rounded-full text-white outline-none transition-shadow hover:ring-2 hover:ring-[color:var(--color-border-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] data-checked:ring-2 data-checked:ring-[color:var(--color-foreground)] data-checked:ring-offset-2 data-checked:ring-offset-[color:var(--color-background)]">
          <RadioPrimitive.Indicator data-slot="swatch-indicator"><CheckIcon className="size-3.5" strokeWidth={3} /></RadioPrimitive.Indicator>
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}

export { SwatchPicker };
