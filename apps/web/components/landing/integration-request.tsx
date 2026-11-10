"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { requestForm, type RequestOption } from "featurespace";

type Item = { name: string; logo: string };

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Each pick is a vote on "integration:<slug>" on the todalo FeatureSpace board.
// Mounted while open: a fresh form each time, with the integration it was opened from already picked.
export function IntegrationRequest({ items, picked, onClose }: { items: Item[]; picked: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current!;
    dialog.current!.showModal();
    const form = requestForm(el, {
      board: "todalo",
      host: process.env.NEXT_PUBLIC_FEATURESPACE_HOST || undefined,
      group: "integration",
      heading: "Which integration should we build next?",
      description: "Pick as many as you like. We build the most requested first.",
      options: items.map((item): RequestOption => ({ value: slug(item.name), label: item.name, icon: `/landing/logos/${item.logo}` })),
      title: (o) => `${o.label} integration`,
      multiple: true,
      other: "Something else",
      showVotes: false,
      message: { label: "What would you use it for?" },
      email: { label: "Email", placeholder: "We'll let you know when it ships" },
      name: false,
      submitLabel: "Send request",
      successMessage: "Thanks, request received!",
      // CSS variables reach into the shadow root, so the accent follows the page's brand token.
      appearance: { mode: "light", color: "var(--brand-strong)", radius: 14, font: "inherit" },
    });
    // ponytail: the SDK has no preselect option, so press the chip in its (open) shadow root.
    el.firstElementChild?.shadowRoot?.querySelector<HTMLButtonElement>(`.opt[data-v="${slug(picked)}"]`)?.click();
    return () => form.destroy();
  }, [items, picked]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      // a click on the backdrop (the dialog itself, outside the card) closes it
      onClick={(event) => event.target === dialog.current && dialog.current.close()}
      aria-label={`Request ${picked}`}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] max-h-[calc(100svh-2rem)] overflow-visible bg-transparent p-0 backdrop:bg-black/25 backdrop:backdrop-blur-[2px]"
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full text-foreground/45 transition-colors hover:bg-black/[0.05] hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        {/* Same glassy card as the rest of the page, so it reads as part of it, not an embed. */}
        <div
          ref={mount}
          className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-[18px] [&>div::part(form)]:rounded-[18px] [&>div::part(form)]:border-white/90 [&>div::part(form)]:bg-white [&>div::part(form)]:pr-12 [&>div::part(form)]:shadow-[0_24px_60px_-28px_rgba(0,0,0,0.35)] [&>div::part(heading)]:font-display [&>div::part(heading)]:text-[22px] [&>div::part(heading)]:font-black [&>div::part(success)]:rounded-[18px] [&>div::part(success)]:border-white/90 [&>div::part(success)]:bg-white"
        />
      </div>
    </dialog>
  );
}
