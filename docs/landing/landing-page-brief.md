# Todalo landing page brief

Status: v2, every section of §2 built (2026-11-10). Open items in §5.
Sources: canvas `Todalo` (canvas.bleat.ch) plus the references Devin sent in chat on 2026-11-09.
Current state: `/` is the landing page (`apps/web/app/page.tsx`); signed-in visitors see it too.

---

## 1. Look & feel (decided)

- **Monochrome.** Off-white background, near-black text, black-and-white imagery (halftone or grain photos, like Brainka's head and Mindly's portrait).
- **One colour: Todalo red**, used only for details: the primary button, small highlights, active states, the "Save x%" badge and the focused integration.
  - The value comes from the app: `--brand: oklch(0.637 0.237 25.331)`, or `oklch(0.704 0.191 22.216)` in dark mode, in `apps/client/src/styles.css`.
  - **Decided: darker red for the primary button fill.** `oklch(0.55 0.21 27)` ≈ `#d01d21`, which gives white text 5.4:1 contrast and passes WCAG AA. The brand red (`#fb2c36`, 3.8:1) stays for small accents only.
- **Type: two typefaces.**
  - A **rounded, soft serif family** for headlines, used upright plus its own **true italic** for the second line, as Mindly does.
  - **The app's font, Geist Variable** (`@fontsource-variable/geist`, also used by `apps/client`), for all page text: nav, body, buttons, pricing and footer. Decided 2026-11-09.
  - Picked from Envato (web-licensed). The shortlist is in [`moodboard.html`](./moodboard.html).
  - **Decided: Sanela** ([Envato](https://elements.envato.com/luxury-serif-font-family-sanela-GPMZU3B)) for headlines.
  - Downloaded (`~/Downloads/luxury-serif-font-family-sanela-*.zip`). It has 9 weights (Thin to Black) and WOFF2 web files, but **no italic**.
  - Copied the Light, Regular, Medium and SemiBold WOFF2 files to `apps/web/app/fonts/sanela/`, ready for `next/font/local`. The weights look very close to each other.
  - **Final (decided): Sanela only, no italic.**
    - Hero line 1 is **Sanela Black**, line 2 is **Sanela Thin**: a big weight contrast instead of an italic.
    - **The lines almost touch but don't:** `line-height: 0.77`. That's the tightest value where no letter collides, measured on the actual letter shapes: about 4px clearance at 118px (≈0.03em). The tightest spot is the "y" tail above the "e" in "the". Mock-up: `headline-final.png`.
    - The clearance depends on the words. If the copy changes, re-check that descenders (g, y, p) don't hit ascenders (h, l, t, f) on the next line.
    - Files: `apps/web/app/fonts/sanela/SANELA-{Black,Thin}.woff2`. Other section headings use Black, or Thin for the quieter ones.
    - Secret Memories was tried (`headline-options.png`) and dropped. Its files were removed.
  - Candidates that were considered:
    - [Secret Memories](https://elements.envato.com/secret-memories-regular-italic-serif-font-duo-QDJTSNK): the closest to Sanela.
    - [Quinela](https://elements.envato.com/family-serif-with-6-weights-quinela-CNFXKKH).
    - [Chelory](https://elements.envato.com/chelory-family-serif-8EG6H6S).
- **Hero photo: AI-generated with Higgsfield (decided).** One person, full body visible, on a plain seamless background, so it's easy to cut out. Black and white.
  - Envato's "Linen, seated" photo was the reference, for pose and lighting only.
  - Round 1 is in `hero-candidates/` (see `contact-sheet.jpg`). Two models were compared: Soul 2.0 and Nano Banana Pro.
  - **Nano Banana Pro gave the clean, barefoot, seamless shots.** Soul 2.0 added floorboards and sandals, and its "woman" prompt came out as a man.
  - Round 2: the framing changed to **head and shoulders, cropped at the chest, like Mindly**. Files: `r2-*.png`, sheet in `contact-sheet-r2.jpg`.
    - `r2-1-man-curly` is the closest to Mindly.
    - `r2-2-woman-wavy` has the same pose.
    - `r2-3` and `r2-4` are three-quarter views with a slight smile.
  - Round 3: **shot from below and much closer** (`r3-*.png`, `contact-sheet-r3.jpg`).
    - **Final (decided): `r3-2-man-below-side`**, relit with a hard, sun-like key light for more shadow and contrast (`r4-1-hard-light.png`).
      - Background removed with Higgsfield.
      - Transparent file trimmed to the person: `apps/web/public/landing/hero-person.webp` (1600px wide, 313 KB). A PNG fallback sits next to it.
      - Untrimmed cutout: `final-hero-cutout-hardlight.png`. The earlier soft-light cutout is `final-hero-cutout.png`.
    - The straight-on versions (`r3-1`, `r3-3`) look up the nostrils too much.
  - Cutout: background removal, then WebP or AVIF with transparency.
- **Logo:** a placeholder mark for now. Devin provides the real one later.
- **Motion:** calm and slow. No bouncy effects.

---

## 2. Page structure (decided)

### 2.1 Header (reference: Brainka)
- A centered pill nav on a light grey background: logo mark, **Features**, **Pricing**.
- Far right: **Log in** as a text link, and **Open Todalo** as a red button.
- Logged-in users who visit `/` should still see the landing page, and "Open Todalo" goes to `/today`.
- **Separate "Get started" (decided):** "Open Todalo" is for existing users. New visitors get a red **Get started** button that leads to sign-up.
  - It appears in the hero, on the pricing cards and in the closing CTA.
  - Header: logged-out visitors see Log in + Get started; logged-in users see Open Todalo. This keeps one red button in the header.

### 2.2 Hero (reference: Mindly) — BUILT (2026-11-09)
- Code: `apps/web/components/landing/hero.tsx`, `site-header.tsx`, `fonts.ts`; page at `apps/web/app/page.tsx`. Latest screenshot: `docs/landing/hero-build-v10.png`.
- Headline: Sanela Black / Sanela Thin, `line-height: 0.77`. A red "Get started" (`/login?mode=signup`) and a ghost "See how it works" (`#features`).
- Portrait: `public/landing/hero-person.webp`, a 3D scene (`perspective` + `preserve-3d`).
- Cards: one tilted cylinder with **two rows** (eye and mouth level) at the same tilt. Each card is cut into 8 slices so it bends with the curve.
  - The arc in front of the face stays empty.
  - The 4 real features sit at the front: Season, Goals, Time blocks, Review.
  - Extra cards at the sides and back show only real or review-type things: Stats, Insights, Productivity, Labels, Inbox, This week.
  - 6 monochrome nature tiles are spread in between (`public/landing/tiles/`).
- Removed on request: the side cards, the connector lines, the rotating badge and the corner notes.

### 2.3 Features: one story told in order (reference: the todoist.com layout) — BUILT (2026-11-10)
- Code: `apps/web/components/landing/features.tsx` (`#features`). Clips + posters: `apps/web/public/landing/features/*.mp4|webp`. Screenshots: `docs/landing/features-v2-*.png`.
- All 4 clips are **real captures** of `apps/client` on branch `feat/smooth-sidebars`. Re-shoot: `scripts/landing-capture.cjs` + `scripts/landing-clips.cjs` (setup in the file header), demo data `scripts/seed-landing-demo.ts` on the `demo@todalo.dev` account. Only the Coach's answers are stubbed in the capture (fixed suggestions and drafts, no model); everything else is the real app.
- **Layout:** the left column holds the steps (title, short copy) and scrolls normally. The right column is sticky and shows a video that changes to match the step in view.
- **The story, in order (changed 2026-11-10: four steps):**
  1. **Set up your season:** the guided season setup (focus in your own words → length and start → switch on the goals to focus on, Primary or Secondary, from the Coach's suggestions and your own → where each goal starts from, in your own words → review; the Coach bar is hidden during it). Clip `season-setup`, seed state `setup`.
  2. **Rank your goals:** primary and secondary goals.
  3. **Plan the week with the Coach:** ask in the command bar (the Coach bar); the Coach drafts the week around the goals, the user keeps what fits, declines the rest and drags blocks to adjust. Clip `coach-plan`, seed state `coach`.
  4. **Review:** see progress and give the agent feedback, which shapes the next season.
- **Mobile (decided):** the sticky column stacks as step, then video, then the next step.
- **Media (changed 2026-11-09): real captures from the start, no placeholders.**
  - Wherever possible, record the real app (muted, looping, `autoplay playsinline`).
  - If a feature can't be captured well at the card's size, or doesn't exist yet, build a **short simulated clip**:
    - The flow is extracted and acted out using the app's own components and styling.
    - It's recorded like a screen capture, as Todoist does.
  - So every step has a real or faithful simulated video, never stock or AI footage.
- **Note:** we copy Todoist's *layout pattern* (sticky media and scroll-synced steps), not their assets, illustrations or brand. Spacing and typography follow our own monochrome system.

### 2.4 Integrations (reference: Dashworks orbit, made into a 3D globe) — BUILT (2026-11-10)
- Code: `apps/web/components/landing/integrations.tsx` (`#integrations`), real logos in `public/landing/logos/` (CC0 "logos" set, MIT "theSVG" set for Outlook/To Do/Raycast, macOS app icons for Mail/Calendar/Reminders/Shortcuts), no text labels. Screenshots: `docs/landing/rest-v3-*-integrations*.png`.
- 23 tiles on a CSS 3D Fibonacci sphere. It drifts, then eases the next tile to the front with a soft red ring and a one-line card beside it.
- Live: Google Calendar, Todoist, and the Coach's BYOK providers that exist in code (OpenAI, Anthropic, OpenRouter, Ollama). ElevenLabs left out: it powers hosted Ramble, not BYOK.
- Tiles are slices bent along the great circle through their centre (the sphere's own curvature, no pole distortion). Focus straightens, lifts and scales the same tile via registered `--bend`/`--lift` (no second copy). The far side fades out like a real globe (`--depth` on the slices; opacity on a 3D container would flatten it).
- Interaction: drag to rotate (sideways only on touch, so the page still scrolls), fling with inertia, click a tile to bring it to the front; auto-play resumes 3.5 s after letting go. Auto-focus eases over 1.6 s and only picks tiles near the equator.
- A slowly rotating 3D globe of logo tiles. Every few seconds one integration **snaps into focus**: it moves to the front, scales up, gets a red ring, and a one-line description appears beside it.
- **Logos on the globe (decided):** a full globe that includes integrations we don't have yet.
  - **Live today:** Google Calendar and Todoist (import).
  - **Not yet:** Notion, Slack, Apple Mail, Outlook, Gmail, Apple Calendar, Outlook Calendar, Apple Reminders, Microsoft To Do, Linear, GitHub, Obsidian, Zoom, Zapier, Raycast, Apple Shortcuts/Siri and Telegram.
  - **BYOK AI providers** (OpenAI, Anthropic, ElevenLabs, OpenRouter) could also be tiles. That would tie the globe to the "Bring your own AI" message.
- **Flag for integrations we don't have yet:** a small clock badge in the corner of the tile.
  - When the tile snaps into focus, the description line reads "Coming soon".
  - A tiny legend under the globe explains it: "◷ = coming soon".
  - This keeps it honest and avoids implying a partnership.
- **Tech:** CSS 3D transforms are enough for about 20 tiles. Three.js is only needed if we want real depth or lighting.

### 2.5 Pricing (reference: the "Built for Growth" cards and the Monthly/Yearly toggle with "Prices in CHF") — BUILT (2026-11-10)
- Code: `apps/web/components/landing/pricing.tsx` (`#pricing`). Screenshots: `docs/landing/rest-v3-*-pricing.png`.
- **Assumption to confirm:** EUR and USD show the CHF numbers for Pro (4/6); Lifetime CHF 149/75, EUR 159/79, USD 179/89. All CTAs go to sign-up until Stripe checkout is wired. The "x of 20 left" counter is built: set `STRIPE_SECRET_KEY` and `STRIPE_FOUNDERS_COUPON` and `apps/web/lib/founders.ts` (tested in `founders.test.ts`) reads the coupon's redemptions (cached 5 min); at 0 the card falls back to the full price. Without them it shows "−50% for the first 20".
- A Monthly/Yearly toggle with a red "Save 33%" badge.
- A currency selector for **CHF, EUR and USD**, defaulting from the visitor's locale and then CHF. Payments go through **Stripe**, with one Price per currency.
- **Three cards:** Free, **Pro** (highlighted as "Most popular") and Lifetime.
- Below the cards: a full-width strip that reads **"Bring your own AI"** (see section 3).

### 2.6 CTA + footer (reference: Helixa) — BUILT, shell (2026-11-10)
- Code: `apps/web/components/landing/closing.tsx`. The dissolve is a mouse-reactive WebGL2 shader (`footer-shader.ts`, mounted by `footer-band.tsx`) with four variants: Mist, Ink, Halftone, Contours. Tune it in the **Toolcraft lab**: `apps/client` dev server → `/footer.html`, then Copy JSON and paste over `footerShaderDefaults`. The footer credits "Developed by BLEAT" → bleat.ch.
- Footer links Privacy (`/privacy`) and Terms (`/terms`): plain-language **drafts** written from what the code does (`components/landing/legal.tsx` wraps both). No social links for now (decided 2026-11-10).
- A light section with a final headline and the CTA. It dissolves into a dark footer through a custom dithered/pixel **shader built in Toolcraft**.
- The footer holds the logo, a few links, legal links and social links.
- We build the section shell; the shader slots in later.

---

## 3. Pricing & AI: needs discussion

### Tiers (decided 2026-11-09)

| | Free | Pro | Lifetime |
|---|---|---|---|
| Price | 0 | **CHF 4/mo yearly (48/yr)** · CHF 6/mo monthly | one-time, CHF 149 (founders −50%) |
| All core features | ✓ | ✓ | ✓ |
| Projects | **limited** (default 5, open) | unlimited | unlimited |
| Calendar view / time blocking | ✗ | ✓ | ✓ |
| Hosted AI (Ramble, agent) | **less** (small monthly allowance) | full Pro allowance | **same as Pro** |
| Bring your own keys | ✓ | ✓ | ✓ |

**Lifetime = everything Pro has, paid once.** This keeps the offer simple.

Yearly vs monthly is 48 vs 72 CHF, so the badge should say **"Save 33%"**, not 20%.

### The core problem
Hosted AI is an ongoing cost: realtime transcription (ElevenLabs) plus LLM calls. A one-time Lifetime price can't cover unlimited hosted AI forever.

### Recommendation
1. **Meter hosted AI in one unit**, for example "AI credits" or simply Ramble minutes plus agent runs. Free gets a small monthly amount and Pro gets a generous one. Before fixing the numbers, we measure the real cost per Ramble minute and per agent run.
2. **BYOK is free on every tier, Free included (confirmed).** Bringing your own key never costs extra. AI use with your own key is unlimited and costs us nothing.
3. **Lifetime = everything Pro has (decided)**, including Pro's monthly hosted AI allowance.
   - ⚠️ Risk: that allowance is an ongoing cost that a one-time payment never covers. The fair-use cap on Pro's allowance is therefore what protects Lifetime, so measure the real cost before launch.
   - **Price:** about 3× yearly, so **CHF 149**.
   - **Founder offer (decided):** the first **20 buyers get 50% off**, so about **CHF 75 / EUR 79 / USD 89**. The card shows a live "x of 20 left" counter, and the offer ends automatically once 20 are sold.
     - Stripe: a coupon (50% off) limited to 20 redemptions, or a separate Price whose Payment Link stops after 20 sales.
     - The counter comes from the Stripe redemption count.
4. **"Bring your own subscription"** (logging in with a ChatGPT or Claude plan instead of an API key) is a separate question. Many providers' terms don't allow third-party apps to use consumer subscriptions. To start, I'd promise **API keys** (OpenAI, Anthropic, ElevenLabs, OpenRouter) and check subscription login provider by provider.

---

## 4. Decided (2026-11-09)

- **Red:** the app's `--brand`.
- **Logo:** a placeholder for now.
- **Fonts and hero photo:** from Envato, shortlist in `moodboard.html`.
- **BYOK:** free on every tier.
- **Founder offer:** first 20 Lifetime buyers get 50% off.
- **Payments and currencies:** Stripe, with CHF, EUR and USD.
- **Integrations globe:** includes integrations we don't have yet, flagged "coming soon".

## 5. Open questions

1. Hero headline copy: "Plan your season. / Let the rest flow." is a placeholder. Keep it, or should I draft 3 options?
2. Free project limit: is 5 OK? Todoist's free plan also uses 5.
3. EUR/USD prices (see §2.5) and the real Stripe Prices. Founder counter is **live against Stripe** (2026-11-10): a Todalo sandbox (test mode) made with `stripe sandbox create`, CLI profile `todalo-sandbox`, coupon `TODALO_FOUNDERS` (50%, once, max 20), both values in `.env`. Claimed into the Bleat organization and renamed **Todalo** on 2026-11-10 (`acct_1Ua28WBC50DUS1tI`). `.env` uses a freshly rolled secret key; the old claimable key that appeared in an agent log is expired (verified: Stripe rejects it). Live keys come when checkout is built.
4. Legal review of the `/privacy` and `/terms` drafts: outside the landing-page work, Devin arranges it before launch (decided 2026-11-10). Privacy was checked against FADP Art. 19 (operator and contact, purposes, recipients, data abroad, retention, rights). Transfers abroad rest on the providers' published standard DPAs with SCCs. Contact on both: devin.hasler@bleat.ch (decided 2026-11-10).
5. Pick the footer shader variant and values in the Toolcraft lab (`/footer.html`).
