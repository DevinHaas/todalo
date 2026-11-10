"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { FOUNDING_MEMBERS } from "@todalo/server/founders";

type Currency = "CHF" | "EUR" | "USD";
const CURRENCIES: Currency[] = ["CHF", "EUR", "USD"];
const SYMBOL: Record<Currency, string> = { CHF: "CHF", EUR: "€", USD: "$" };

// ponytail: EUR/USD mirror the CHF numbers (brief §3) until the Stripe Prices exist; Lifetime from the founder offer.
const PRO = { monthly: 6, yearly: 4 }; // per month; yearly is billed 48 at once, monthly 72 a year → "Save 33%"
const LIFETIME: Record<Currency, { full: number; founders: number }> = {
  CHF: { full: 149, founders: 75 },
  EUR: { full: 159, founders: 79 },
  USD: { full: 179, founders: 89 },
};

const EURO = new Set("AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(" "));
/** The visitor's currency from their locale's region, CHF otherwise. */
function localCurrency(): Currency {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? "";
    if (EURO.has(region)) return "EUR";
    if (region === "US") return "USD";
  } catch {}
  return "CHF";
}

const SIGNUP = "/login?mode=signup";
const noop = () => () => {};

const PLANS = [
  {
    name: "Free",
    blurb: "Everything you need to run a season.",
    features: ["Seasons, goals and weekly reviews", "Up to 5 projects", "A small monthly hosted AI allowance", "Your own AI keys, unlimited"],
    cta: "Get started",
  },
  {
    name: "Pro",
    blurb: "For planning every hour, not just the list.",
    features: ["Everything in Free", "Unlimited projects", "Calendar view and time blocking", "The full hosted AI allowance for Ramble and the Coach"],
    cta: "Get started",
  },
  {
    name: "Lifetime",
    blurb: "Everything in Pro, paid once.",
    features: ["Everything in Pro, for good", "Pro's monthly hosted AI allowance", `Founders' price for the first ${FOUNDING_MEMBERS} buyers`],
    cta: "Get lifetime",
  },
] as const;

function Price({ currency, amount, unit, note, strike }: { currency: Currency; amount: number; unit: string; note: string; strike?: number }) {
  return (
    <div className="mt-6">
      <div className="flex items-baseline gap-1.5">
        <span className="self-start pt-1.5 text-[13px] font-medium text-foreground/55">{SYMBOL[currency]}</span>
        <span className="font-display text-[3.25rem] font-black leading-none tracking-[-0.02em] tabular-nums">{amount}</span>
        {strike !== undefined && <s className="text-[15px] text-foreground/35 tabular-nums">{strike}</s>}
        <span className="text-[13px] text-foreground/50">{unit}</span>
      </div>
      <p className="mt-1.5 h-4 text-[12px] text-foreground/45">{note}</p>
    </div>
  );
}

export function Pricing({ foundersLeft }: { foundersLeft: number | null }) {
  const [yearly, setYearly] = useState(true);
  const [picked, setCurrency] = useState<Currency | null>(null);
  // The locale never changes while the page is open; the server renders CHF.
  const local = useSyncExternalStore(noop, localCurrency, () => "CHF" as const);
  const currency = picked ?? local;

  const life = LIFETIME[currency];
  const prices = [
    <Price key="free" currency={currency} amount={0} unit="forever" note="No card needed" />,
    <Price
      key="pro"
      currency={currency}
      amount={yearly ? PRO.yearly : PRO.monthly}
      unit="/ month"
      note={yearly ? `Billed ${SYMBOL[currency]} ${PRO.yearly * 12} once a year` : "Billed monthly"}
    />,
    // Founders' price while seats are left; null = Stripe not connected yet, so no live count.
    foundersLeft === 0 ? (
      <Price key="life" currency={currency} amount={life.full} unit="once" note="One payment, yours for good" />
    ) : (
      <Price
        key="life"
        currency={currency}
        amount={life.founders}
        strike={life.full}
        unit="once"
        note={foundersLeft === null ? `Founders' price, −50% for the first ${FOUNDING_MEMBERS}` : `Founders' price, ${foundersLeft} of ${FOUNDING_MEMBERS} left`}
      />
    ),
  ];

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="relative mx-auto w-full max-w-6xl scroll-mt-6 px-6 py-24 md:py-36">
      <div className="landing-reveal mx-auto max-w-2xl text-center">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-foreground/45">Pricing</p>
        <h2 id="pricing-title" className="mt-4 font-display text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.77] tracking-[-0.01em]">
          <span className="block font-black">Start free.</span>
          <span className="block font-thin">Upgrade when it fits.</span>
        </h2>
      </div>

      <div className="mx-auto mt-10 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        {/* Billing period: a switch, Monthly ↔ Yearly. */}
        <div className="flex items-center gap-3 text-[13px]">
          <button type="button" onClick={() => setYearly(false)} className={"transition-colors " + (yearly ? "text-foreground/50 hover:text-foreground" : "text-foreground")}>
            Monthly
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={yearly}
            aria-label="Bill yearly"
            onClick={() => setYearly(!yearly)}
            className={
              "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 " +
              (yearly ? "border-brand-strong bg-brand-strong" : "border-black/[0.08] bg-black/[0.08]")
            }
          >
            <span
              aria-hidden
              className={
                "absolute left-0.5 top-1/2 size-[18px] -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-300 " +
                (yearly ? "translate-x-5" : "")
              }
            />
          </button>
          <button type="button" onClick={() => setYearly(true)} className={"transition-colors " + (yearly ? "text-foreground" : "text-foreground/50 hover:text-foreground")}>
            Yearly
          </button>
          <span className="rounded-full bg-brand/12 px-1.5 py-0.5 text-[11px] font-medium text-brand-strong">Save 33%</span>
        </div>
        {/* Currency: a native single select, styled as the page's pill. */}
        <label className="flex items-center gap-2 text-[13px] text-foreground/50">
          Prices in
          <span className="relative">
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
              className="cursor-pointer appearance-none rounded-full border border-black/[0.06] bg-white/70 py-1.5 pl-3.5 pr-8 text-[13px] font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-brand/40"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground/50" />
          </span>
        </label>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3 md:items-stretch">
        {PLANS.map((plan, i) => {
          const pro = plan.name === "Pro";
          return (
            <div
              key={plan.name}
              className={
                "landing-reveal-soft relative flex flex-col rounded-[18px] border p-6 md:p-7 " +
                (pro
                  ? "border-white/90 bg-gradient-to-b from-white/95 to-white/75 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.3),0_0_0_1px_color-mix(in_oklab,var(--brand)_35%,transparent)]"
                  : "border-white/70 bg-white/45 shadow-[0_1px_2px_rgba(0,0,0,0.04)]")
              }
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-medium">{plan.name}</h3>
                {pro && <span className="rounded-full bg-brand/12 px-2.5 py-1 text-[11px] font-medium text-brand-strong">Most popular</span>}
              </div>
              <p className="mt-1 text-[13px] text-foreground/55">{plan.blurb}</p>
              {prices[i]}
              <ul className="mt-6 flex-1 space-y-2.5 border-t border-black/[0.06] pt-6 text-[13.5px] text-foreground/75">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <Check className={"mt-0.5 size-4 shrink-0 " + (pro ? "text-brand" : "text-foreground/40")} strokeWidth={2} />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={SIGNUP}
                className={
                  "landing-cta mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium " +
                  (pro
                    ? "bg-brand-strong text-white shadow-[0_8px_20px_-8px_var(--brand-strong)] hover:opacity-90"
                    : "border border-black/[0.08] bg-white/70 backdrop-blur hover:bg-white")
                }
              >
                {plan.cta} <ArrowRight className="size-4" />
              </Link>
            </div>
          );
        })}
      </div>

      {/* Bring your own AI (brief §3): free on every plan. */}
      <div className="mx-auto mt-4 flex max-w-5xl flex-col gap-6 rounded-[18px] border border-white/90 bg-gradient-to-b from-white/95 to-white/75 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:flex-row md:items-center md:justify-between md:p-7">
        <div className="max-w-xl">
          <h3 className="font-display text-[1.9rem] font-black leading-[0.95]">Bring your own AI.</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground/60">
            Use your own OpenAI, Anthropic or OpenRouter key, or a local model through Ollama. On every plan, Free included, with no limits and no
            markup.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Supported providers">
          {[
            { name: "OpenAI", logo: "openai.svg" },
            { name: "Anthropic", logo: "anthropic.svg" },
            { name: "OpenRouter", logo: "openrouter.svg" },
            { name: "Ollama", logo: "ollama.svg" },
          ].map((p) => (
            <li key={p.name} className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/80 px-3 py-1.5 text-[12.5px] text-foreground/75">
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo */}
              <img src={`/landing/logos/${p.logo}`} alt="" className="size-3.5 object-contain" />
              {p.name}
            </li>
          ))}
        </ul>
      </div>

    </section>
  );
}
