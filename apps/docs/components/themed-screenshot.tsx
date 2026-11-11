import Image from "next/image";
import type { ReactNode } from "react";

export type ThemedScreenshotProps = {
  light: string;
  dark: string;
  alt: string;
  width: number;
  height: number;
  caption?: ReactNode;
  className?: string;
};

export function ThemedScreenshot({ light, dark, alt, width, height, caption, className }: ThemedScreenshotProps) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-xl border border-ink/10 bg-paper p-4 sm:p-6">
        <Image src={light} alt={alt} width={width} height={height} unoptimized className="h-auto max-w-full rounded-md dark:hidden" />
        <Image src={dark} alt={alt} width={width} height={height} unoptimized className="hidden h-auto max-w-full rounded-md dark:block" />
      </div>
      {caption && <figcaption className="mt-2 text-sm text-ink/70">{caption}</figcaption>}
    </figure>
  );
}
