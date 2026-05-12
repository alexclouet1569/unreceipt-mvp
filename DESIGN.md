# UnReceipt — Design System

> Source of truth for the product surface (`app.unreceipt.com` + Capacitor wrapper). Marketing site (`unreceipt.com/`), `/admin`, and Stripe Checkout are out of scope.

## Product Context

- **What this is.** Concierge receipt service for Swedish SMBs. Customer forwards email receipts to a private `u-XXXX@unreceipt.com` address, founder (then automation) cleans them, customer sees clean VAT-ready records. Customer can also capture a paper receipt with a photo → Claude vision OCR fills the form.
- **Who it's for.** Ops / finance lead at a 10–30 person Swedish SMB. Already uses Kivra personally. Wants Nordic-clean typography and spacing. Hates 2010-era expense-tool clutter (Expensify, Concur).
- **Memorable thing.** The product must feel **premium and trustworthy** — receipts contain sensitive financial data — and the **value must be obvious in 5 seconds**: each card reads as brand + amount, and the detail view holds every line from the real receipt.
- **Mental model.** Inbox-as-home-screen (à la Kivra) — but distinctly UnReceipt, not a Kivra clone.

## Aesthetic Direction

- **Direction.** Brutally minimal × Editorial. Typography and whitespace do almost all the work. Paper-material surfaces.
- **Decoration level.** Minimal. One signature motif: a subtle perforated/serrated edge as the receipt metaphor (top of the detail view, dashed dividers between detail sections). No drop shadows except on the FAB. No gradients ever. No background patterns. No glassmorphism.
- **Mood.** A private bank app for a one-person finance team — serious but warm, never enterprise-cluttered, never playful-toy. The brand green appears once per screen like a wax seal.
- **Reference for differentiation from Kivra.** Kivra is broad (mail, bills, salaries, receipts). UnReceipt is receipt-focused. The design language celebrates that focus through the perforated edge motif, the `Un` wordmark, mono amounts, and tighter density.

## Signature elements (UnReceipt's own face)

1. **The `Un` wordmark.** `Un` set in Geist Mono on a near-black `ink` pill, butted against `Receipt` in Manrope 700. Used in the app header on every screen.
2. **The perforated edge.** 8×8 dot-mask repeating along the top of receipt detail views. Reinforced by `1px dashed hairline` dividers between detail sections.
3. **Mono amounts everywhere.** Every monetary value in the product renders in Geist Mono — list cards, detail totals, line items, VAT panel. Vertically aligns amounts across the inbox. This is the typographic identity.
4. **Tighter density than Kivra.** 12px card radius, 12×14 padding, 8px between cards. Signals "finance pro tool," not "consumer doc storage."

## Typography (per brand book)

- **Display:** **Manrope** — weights 600, 700, 800. App titles, screen titles, merchant names on cards.
- **Body:** **Figtree** — weights 400, 500, 600. Body text, captions, labels, form inputs, buttons.
- **Monetary amounts only:** **Geist Mono** — weights 500, 600. Loaded via `next/font/google`.
- **Loading:** all three via `next/font/google` (already configured for Manrope + Figtree in `src/app/layout.tsx`).

### CSS variable mapping (proposed rename for clarity)

| Variable | Font | Current state |
|---|---|---|
| `--font-display` | Manrope | rename from `--font-sans` |
| `--font-sans` | Figtree | rename from `--font-accent` (this becomes the new body default) |
| `--font-mono` | Geist Mono | already wired; only change is the family (Geist Mono replaces the geist-mono variable) |

### Type scale (mobile-first, 4px-grid friendly)

| Token | Size / line / track | Font | Weight | Usage |
|---|---|---|---|---|
| `display-2xl` | 44 / 1.05 / -0.03em | Manrope | 800 | Hero / rare |
| `display-xl` | 32 / 1.10 / -0.02em | Manrope | 700 | Screen titles, large numbers |
| `display-lg` | 24 / 1.15 / -0.02em | Manrope | 700 | App header `UnReceipt` wordmark |
| `body-lg` | 18 / 1.45 / -0.01em | Figtree | 600 | Merchant name (detail view) |
| `body` | 15 / 1.50 / 0 | Figtree | 400 | Default body |
| `caption` | 13 / 1.40 / 0 | Figtree | 500 | Dates, meta, secondary labels |
| `micro` | 11 / 1.30 / 0.06em UPPER | Figtree | 600 | Section labels, badges |
| `merchant-name` (card) | 15 / 1.2 / -0.01em | Manrope | 700 | Merchant name on inbox card |
| `amount-xl` | 18 / 1.10 / -0.01em | Geist Mono | 500 | Card amount |
| `amount-lg` | 22 / 1.10 / -0.01em | Geist Mono | 500 | Detail-view header amount |
| `amount-display` | 40 / 1.05 / -0.02em | Geist Mono | 500 | Detail-view total |
| `amount-row` | 14 / 1.4 / 0 | Geist Mono | 400 | Line items, VAT rows |

All amounts also apply `font-variant-numeric: tabular-nums`.

## Color

Restrained palette. Brand green is an accent, not a background.

### Light mode

| Token | Hex | Role |
|---|---|---|
| `--brand` | `#27BE7B` | FAB, key totals, focus rings, brand badges. Used sparingly. |
| `--brand-deep` | `#1F9D63` | Hover / pressed on brand surfaces |
| `--brand-tint` | `#ECF7E7` | Empty-state hero card, pilot banner, VAT-summary panel. **Never the page background.** |
| `--surface` | `#FAFAF7` | Page background — Nordic cream, evokes paper |
| `--card` | `#FFFFFF` | Receipt cards, sheets, popovers |
| `--ink` | `#171A2E` | Primary text (replaces the current `#303568`) |
| `--ink-muted` | `#5A5F7A` | Body, secondary labels |
| `--ink-faint` | `#9CA0B8` | Dates, meta, micro caps |
| `--hairline` | `#E8E5DD` | 1px borders and dividers — warm gray to match the cream |
| `--negative` | `#C73E4E` | Destructive only (delete) |

### Dark mode

| Token | Hex | Role |
|---|---|---|
| `--surface` | `#0F1124` | Page background |
| `--card` | `#1A1D33` | Card / sheet |
| `--ink` | `#EFE8DA` | Primary text — warm off-white preserves paper feeling |
| `--ink-muted` | `#A4A8C0` | Body |
| `--ink-faint` | `#6A6E88` | Meta |
| `--hairline` | `#2A2D45` | Borders |
| `--brand` | `#27BE7B` | Unchanged — passes contrast on dark |
| `--brand-tint` | `#1A3A2A` | Subtle brand surfaces on dark |

### shadcn token mapping (so the component library inherits the system automatically)

```css
--background: var(--surface);
--foreground: var(--ink);
--card: var(--card);
--card-foreground: var(--ink);
--popover: var(--card);
--popover-foreground: var(--ink);
--primary: var(--brand);
--primary-foreground: #FFFFFF;
--secondary: var(--brand-tint);
--secondary-foreground: var(--ink);
--muted: var(--brand-tint);
--muted-foreground: var(--ink-muted);
--accent: var(--brand-tint);
--accent-foreground: var(--ink);
--destructive: var(--negative);
--border: var(--hairline);
--input: var(--hairline);
--ring: var(--brand);
```

## Spacing (4px base)

```
2xs  2px    Hairline gaps inside dense rows
xs   4px    Icon padding, micro gaps
sm   8px    Gap between receipt cards, chip padding
md   12px   Card padding-vertical, button padding-vertical
lg   16px   Card padding-horizontal, page horizontal padding
xl   24px   Section gutters
2xl  32px   Major section separators
3xl  48px   Hero spacing on empty / onboarding states
4xl  64px   Reserve for marketing-adjacent screens
```

- Card padding: `12 14` (vertical horizontal).
- Gap between cards: `8`.
- Page horizontal padding: `16` mobile, `24` tablet+.
- Max content width: `540px` (centered on tablet+).

## Layout

- **Approach.** Strict single-column. Mobile-first 390px primary canvas. No sidebar, ever.
- **Header.** Compact 12px-padded top bar with the `UnReceipt` wordmark on the left and a small filter/search icon-button on the right (36px). No nav tabs in v1.
- **List.** Receipt cards in a single column with `8px` gaps. Date groups (`Today`, `Yesterday`, `This week`, `Earlier in May`) as `micro` labels above the relevant cluster.
- **FAB.** Fixed bottom-center, `64×64`, brand green, white `+` icon. Safe-area-inset aware (Capacitor).
- **Detail view.** Full-screen sheet. Perforated edge at the top. Large mono total, merchant block, items section, VAT panel in `--brand-tint`, details section. Dashed `1px hairline` dividers between sections.
- **Empty state.** Calm illustrated mark in a `64×64 brand-tint` square, short pitch, then a `card` showing the user's unique `u-XXXX@unreceipt.com` email and a `Copy` button.

### Border radius

```
sm   6px    Inputs, small chips
md   10px   Buttons, list items, icon buttons
lg   12px   Receipt cards (signature: tighter than Kivra)
xl   16px   Modal sheets
2xl  20px   Hero / empty illustration mark
full 9999   FAB, avatars, pill badges
```

## Motion (intentional, never gratuitous)

- **Easing.**
  - Entrance: `cubic-bezier(0.32, 0.72, 0, 1)` — the Apple-spring-out
  - Exit: `cubic-bezier(0.4, 0, 1, 1)` — ease-in
  - FAB press: `cubic-bezier(0.34, 1.56, 0.64, 1)` — gentle overshoot
- **Durations.**
  - micro 100ms (state changes, hover)
  - short 200ms (card tap response)
  - medium 320ms (route transitions, sheet open)
  - long 480ms (only for the OCR result reveal)
- **List items.** Fade-in on mount, no per-item stagger. Premium apps don't stagger; staggers feel app-store-template.
- **Card tap.** `transform: scale(0.985)` over 120ms, then the detail sheet slides up over 320ms. No shared-element flight (was a "risk" option — dropped to keep things calm).
- **FAB press.** Scale 0.92 → 1.04 → 1.0 over 240ms.
- **OCR moment.** Single `Reading your receipt…` status with all five fields rendered as shimmer skeletons. When the API returns, all fields fade-in together over 480ms (long). No per-field cascade, no typing cursor.

## Components

### Receipt list item (card)

```
┌─────────────────────────────────────────────────┐
│  [40px logo]  ICA Kvantum                  245,00 kr  │
│               Groceries · 2h ago                       │
└─────────────────────────────────────────────────┘
```

- Container: `bg-card`, `border 1px hairline`, `radius lg (12)`, `padding 12 14`, `gap 12`.
- **No shadow.** Hairline only.
- Logo block: `40×40`, `radius md (10)`, either a colored block with merchant initials (white, weight 700, 14px) or a single emoji at 20px on `--surface`.
- Merchant name: `Manrope 700 / 15 / -0.01em` in `--ink`. Single line, ellipsis.
- Meta row: `Figtree 500 / 13` in `--ink-faint`. Format: `Category · relative date`. `·` separators with 6px margin.
- Amount: `Geist Mono 500 / 18 / -0.01em` in `--ink`. Currency suffix `kr` at 11px in `--ink-faint`, 3px left margin, vertically aligned to baseline+1px.
- Active state: `scale(0.985)` over 120ms.

### Receipt detail card

- Sheet enters from bottom. `radius xl (16)` top corners only.
- Top: 12px back-button row showing `Receipt · #2026-NNNN` in `micro` style.
- Perforated edge directly below header (8×8 dot mask, surface-colored dots subtract from card).
- Merchant block: `56×56` logo (`radius 14`), 20px merchant name (Manrope 700), 13px sub-line in `--ink-muted` (e.g. `Stockholm C → Göteborg C` for travel, store address for retail).
- **Display total:** `amount-display` (Geist Mono 40px), with `kr` at 18px and `vertical-align: 4px` after.
- Date line: `body / 14` in `--ink-muted`. Format: `Yesterday · 14:32 · Card ending 4421`.
- Sections separated by `1px dashed hairline` dividers, `padding 20 0`.
- VAT panel: `--brand-tint` background, `1px` border of `color-mix(in srgb, var(--brand) 20%, transparent)`, `radius md (10)`, `padding 14 16`. Each row in `Geist Mono` for values.
- Line items list: `desc` left in `Figtree 400`, `price` right in `Geist Mono 400`, `border-bottom 1px hairline` per row except the last.

### Capture dialog (OCR moment)

- Stage 1: photo picker. Empty placeholder with dashed border and a subtle paper-grain background.
- Stage 2 (after photo selected): `Reading your receipt…` status row with a pulsing green dot. All five form fields below render as shimmer skeletons (varied widths: 65%, 35%, 50%, 40%, 30%).
- Stage 3 (API returned): skeletons replaced with filled `field-input`s. All fields fade-in over `long (480ms)`. Submit button enables.
- Stage 4 (manual review/edit): fields are editable. Save button enables on any edit; otherwise disabled.

### Empty state

- `64×64` brand-tint square with rounded corners (`radius xl (20)`) holding a calm line illustration of a receipt mark.
- Title `display-lg` (Manrope 700 / 22): `Your inbox is empty`.
- Body `body` (Figtree 400 / 14) in `--ink-muted`, max-width 280px, centered: `Forward your email receipts to your private inbox address. We'll have them VAT-ready in minutes.`
- Email card: `bg-card`, `border 1px hairline`, `radius lg (12)`, `padding 14 16`. The address renders in `Geist Mono 500 / 14`. Brand-green Copy button on the right (`radius 9px`, Figtree 600 13).
- FAB still present (so the customer can capture even before any email arrives).

### FAB

- `64×64` circular, `bg: --brand`, `border: none`.
- `box-shadow: 0 8px 24px -8px rgba(31, 157, 99, 0.45), 0 2px 6px -2px rgba(23, 26, 46, 0.08)` — only place shadow exists in the system.
- Icon: white `+`, 28×28, stroke 2.5.
- Position: `fixed`, `bottom: env(safe-area-inset-bottom) + 32px`, `left: 50%`, `transform: translateX(-50%)`.
- Press: `scale(0.92)` then spring back to 1.0 over 240ms.

### Wordmark (`UnReceipt`)

A reusable component:

```tsx
<span className="un-mark">
  <span className="un">Un</span>Receipt
</span>
```

- Outer: `font-display`, `font-weight: 700`, `letter-spacing: -0.02em`, `display: inline-flex`, `align-items: baseline`, `gap: 1px`.
- `.un`: `font-mono`, `font-weight: 500`, `font-size: 0.78em`, `letter-spacing: 0`, `padding: 1px 3px 1px 4px`, `border-radius: 5px`, `background: var(--ink)`, `color: var(--surface)`, `margin-right: 3px`, `transform: translateY(-1px)`.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-12 | Page background switches from mint `#ECF7E7` to cream `#FAFAF7` | Mint background reads as marketing; cream reads as paper / tool. Mint reserved for empty-state hero, pilot banner, VAT panel. |
| 2026-05-12 | Primary text deepens from `#303568` to `#171A2E` | Better contrast on cream surface; sharper read on small mobile type. |
| 2026-05-12 | Geist Mono added for all monetary amounts | Vertical alignment across the inbox; signals "financial software." |
| 2026-05-12 | Border radius bumped from 10px to 12px on cards | Slight premium uplift while staying tighter than Kivra. |
| 2026-05-12 | Cards use hairline border only, no shadow | Nordic-flat aesthetic. Shadow reserved for FAB. |
| 2026-05-12 | Perforated-edge motif introduced (detail view top, dashed section dividers) | Receipt metaphor as visual signature; differentiates from Kivra's generic doc-mailbox look. |
| 2026-05-12 | `UnReceipt` wordmark with mono `Un` tag added to app header | Brand mark visible on every screen; distinctly UnReceipt. |
| 2026-05-12 | OCR moment dialed down to single `Reading…` state + collective field reveal | Founder preference: calm, not theatrical. |

---

## Handoff — what the next PR(s) need to change

Suggested order. Each bullet is a roughly self-contained PR.

### PR 1 — Token swap (one-line CSS-only changes ripple through everything)

- `src/app/globals.css`
  - Update `:root` block: `--background: #FAFAF7`, `--foreground: #171A2E`, `--card: #ffffff`, `--popover: #ffffff`, `--popover-foreground: #171A2E`, `--card-foreground: #171A2E`, `--secondary: #ECF7E7`, `--secondary-foreground: #171A2E`, `--muted: #ECF7E7`, `--muted-foreground: #5A5F7A`, `--accent: #ECF7E7`, `--accent-foreground: #171A2E`, `--border: #E8E5DD`, `--input: #E8E5DD`, `--destructive: #C73E4E`.
  - Update `.dark` block to the dark-mode table above.
  - Bump `--radius` from `0.625rem` to `0.75rem` (12px). Scale multipliers stay.
  - Add new tokens in `:root` and `.dark` for the explicit ink/hairline/surface layer: `--ink`, `--ink-muted`, `--ink-faint`, `--hairline`, `--surface`. Map shadcn aliases to these per the table above so existing components inherit automatically.
- `@theme inline` block: add `--font-display`, expose `--ink`, `--ink-muted`, `--ink-faint`, `--hairline`, `--surface` so Tailwind sees them.

### PR 2 — Typography

- `src/app/layout.tsx`
  - Rename current `Manrope` variable from `--font-sans` to `--font-display`.
  - Rename current `Figtree` variable from `--font-accent` to `--font-sans` (Figtree becomes body default).
  - Add `import { Geist_Mono } from "next/font/google"` and a new const exposed as `--font-mono`.
  - Apply all three variables to `<html>`.
- `src/app/globals.css`
  - `html { @apply font-sans; }` — already correct (Figtree is now `--font-sans`).
  - Add `.font-display { font-family: var(--font-display); }` utility.
- Add type-scale utility classes (or extend `@theme inline`) so the scale tokens above are addressable as Tailwind classes, e.g. `text-display-xl`, `text-amount-xl`, etc.

### PR 3 — Wordmark + perf-edge primitives

- New file `src/components/brand/Wordmark.tsx` — implements the `<UnReceipt />` mark per the spec above. Used in the authed app header.
- New file `src/components/brand/PerfEdge.tsx` — a pure CSS `div` with the 8×8 dot mask. Exposes a variant prop for `direction: "top" | "bottom"` and one for `dashed-divider` style.

### PR 4 — Receipt list item redesign

- `src/components/receipt/ReceiptListItem.tsx`
  - Tighten container per the spec: `border 1px hairline`, `radius lg (12)`, `padding 12 14`, no shadow.
  - Add the 40px logo block with the merchant-initials variant.
  - Apply `font-display font-bold` to merchant name; `font-mono font-medium` (and `tabular-nums`) to the amount; `caption` style to the meta row.
  - Date grouping happens at the page level — emit a `data-day-group` attribute the parent can use to insert `micro` labels.
- `src/app/app/(authed)/dashboard.tsx` — group items by relative day and render `micro` labels above each group.

### PR 5 — Receipt detail card redesign

- `src/components/receipt/ReceiptDetailCard.tsx` + `src/app/app/(authed)/ReceiptDetailDialog.tsx`
  - Use `<PerfEdge direction="top" />` directly below the dialog header.
  - Use `1px dashed hairline` dividers between sections (not solid).
  - Apply `amount-display` to the total, `amount-row` to line items and VAT rows.
  - Wrap VAT section in a `--brand-tint` panel.

### PR 6 — Capture dialog (OCR) calm-down

- `src/app/app/(authed)/CaptureDialog.tsx`
  - Replace the current OCR loading UX with: single status row (`Reading your receipt…` + pulsing brand dot), five shimmer-skeleton fields (varied widths), then a single 480ms collective reveal when the API returns.
  - Remove any per-field streaming logic if present.
- Update related tests in `src/app/app/(authed)/__tests__/CaptureDialog.test.tsx`.

### PR 7 — Empty state

- `src/app/app/(authed)/dashboard.tsx` — render the empty-state composition per spec when the receipts query returns 0. Lead with the user's `u-XXXX@unreceipt.com` address + Copy button. FAB stays visible.

### PR 8 — FAB

- New `src/components/CaptureFab.tsx` rendering the spec'd FAB. Slot into the authed app shell, fixed bottom-center, safe-area aware. Reuse the existing capture-dialog open handler.

### Scope boundaries

- `/admin/*` (founder concierge), `/subscribe`, the Stripe Checkout pages, `src/app/_landing.tsx` and `unreceipt.com/` marketing surface are **NOT** in scope for this design system. The token swap in PR 1 will ripple to them by default — that's fine, but **don't redesign their layouts** as part of this work.
- The PWA manifest icons and apple-touch-icon are outside the system; revisit separately if the wordmark gets a final icon treatment.

### What stays the same

- Existing routes, layouts, middleware, Supabase wiring, Stripe flow, OCR API — none of this changes. This is a visual / token / component refresh, not an architectural one.
- shadcn primitives stay; they just inherit the new tokens. No need to fork the library.
