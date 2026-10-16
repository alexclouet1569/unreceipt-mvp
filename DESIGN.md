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

1. **The brand wordmark.** Brand-book primary mark: receipt-glyph isotype (rounded receipt with serrated bottom + circular arrow wrapping the top-left) paired with the bespoke wordmark `Un` in **Deep Space** + `Receipt` in **Green Mint**, set in **Manrope ExtraBold (800)**. Used in the app header on every screen. The shared component is `src/components/brand/Wordmark.tsx`; render `<Wordmark variant="horizontal" />` in headers, `variant="stacked"` for centered hero placements (e.g. /app/login), `variant="icon"` for the isotype-only PWA / favicon surfaces.
2. **The perforated edge.** 8×8 dot-mask repeating along the top of receipt detail views. Reinforced by `1px dashed hairline` dividers between detail sections.
3. **Mono amounts everywhere.** Every monetary value in the product renders in Geist Mono — list cards, detail totals, line items, VAT rows and the capture sheet's VAT panel. Never on dates, counts, ids or codes (use `tabular-nums` in Manrope for those). Vertically aligns amounts across the inbox. This is the typographic identity.
4. **Tighter density than Kivra.** 12px card radius, 12×14 padding, 8px between cards. Signals "finance pro tool," not "consumer doc storage."

## Typography (per brand book pp. 15–16)

- **Primary (body + headings):** **Manrope** — weights 600, 700, 800. App titles, screen titles, merchant names on cards, and all default body text. Manrope is the face of the product.
- **Italic accent:** **Figtree** — weights 400, 500, 600. Reserved for short punchy callouts, pull quotes, and brief descriptive notes (e.g. the empty-state inbox subtitle). Always paired with `italic`. Never the body default, never on headings, never on monetary amounts.
- **Monetary amounts only:** **Geist Mono** — weights 500, 600. Loaded via `next/font/google`.
- **Loading:** all three via `next/font/google` (configured in `src/app/layout.tsx`).

### CSS variable mapping

| Variable | Font | Tailwind utility |
|---|---|---|
| `--font-sans` | Manrope | `font-sans` (default body) |
| `--font-display` | Manrope (alias of `--font-sans`) | `font-display` (kept so existing heading utilities resolve to Manrope) |
| `--font-accent` | Figtree | `font-accent` — pair with `italic` |
| `--font-mono` | Geist Mono | `font-mono` (monetary amounts only) |

### Type scale (mobile-first, 4px-grid friendly)

| Token | Size / line / track | Font | Weight | Usage |
|---|---|---|---|---|
| `display-2xl` | 44 / 1.05 / -0.03em | Manrope | 800 | Hero / rare |
| `display-xl` | 32 / 1.10 / -0.02em | Manrope | 700 | Screen titles, large numbers |
| `display-lg` | 24 / 1.15 / -0.02em | Manrope | 700 | App header `UnReceipt` wordmark |
| `body-lg` | 18 / 1.45 / -0.01em | Manrope | 600 | Merchant name (detail view) |
| `body` | 15 / 1.50 / 0 | Manrope | 400 | Default body |
| `caption` | 13 / 1.40 / 0 | Manrope | 500 | Dates, meta, secondary labels |
| `micro` | 11 / 1.30 / 0.06em UPPER | Manrope | 600 | Section labels, badges |
| `accent` | 14 / 1.50 / 0 | Figtree (italic) | 400–500 | Callouts, pull quotes, brief descriptive notes |
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
| `--brand` | `#27BE7B` | Brand accent: wordmark, key totals, brand badges, icons. Used sparingly. **Never under white text** (2.4:1). |
| `--brand-deep` | `#1F9D63` | Hover on brand accents |
| `--brand-action` | `#1A7F52` | Anything pressed or focused: primary buttons, the FAB, focus rings (`--primary`, `--ring`). White text 5.0:1 (AA). |
| `--brand-action-deep` | `#176E47` | Hover / pressed on `--brand-action` |
| `--brand-tint` | `#ECF7E7` | Empty-state hero card, pilot banner, VAT-summary panel. **Never the page background.** |
| `--surface` | `#FAFAF7` | Page background — Nordic cream, evokes paper |
| `--card` | `#FFFFFF` | Receipt cards, sheets, popovers |
| `--ink` | `#303568` | Primary text — brand-book "Deep Space" |
| `--ink-muted` | `#5A5F7A` | Body, secondary labels |
| `--ink-faint` | `#9CA0B8` | Dates, meta, micro caps |
| `--hairline` | `#E8E5DD` | 1px borders and dividers — warm gray to match the cream |
| `--negative` | `#C73E4E` | Destructive only (delete) |
| `--attention` | `#C99440` | "Needs attention" accent: review-needed left rule on receipt cards, over-the-plan progress bar. Friendly honey, never red. |
| `--attention-tint` | `#FBF1DE` | Background of attention notices (plan-usage notice above the inbox) |
| `--attention-deep` | `#8C6320` | Text and icons on `--attention-tint` (≈5:1, passes AA) |
| `--attention-mint` | `#6B9778` | Desaturated mint badge paired with the review-needed slice |

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
--primary: var(--brand-action);
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
--ring: var(--brand-action);
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
- **Group and filter.** A two-option segmented control (`By date` / `By category`, 44px buttons with `aria-pressed`, `--surface` track, `--card` thumb) sits above the filter chips. By category, sections are ordered most-used first and the micro label carries the count and the total per currency (`68.00 kr + €18.50` — never converted). The chip row (All, Review needed, then each used category) scrolls sideways; each chip is a 36px pill inside a 44px tap target, `aria-pressed`, active = `--card` with an ink border (honey for Review needed — never mint). Counts in Manrope `tabular-nums`. Tapping the active category chip again goes back to All.
- **FAB.** Fixed bottom-center, `64×64`, `--brand-action` green, white `+` icon. Safe-area-inset aware (Capacitor).
- **Detail view.** The digital receipt (see "Digital receipt") on a `--surface` backdrop, with the edit / PDF / delete actions below it.
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
- **OCR moment.** Single `Reading your receipt…` status with skeletons laid out like the review (amount, VAT panel, field rows). When the API returns, all fields fade-in together over 480ms (long). No per-field cascade, no typing cursor.

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

### Digital receipt (`ReceiptDetailCard`)

Shown right after a capture is saved (the capture sheet's "Receipt saved" step, with **PDF** and **Done**) and on the Digital tab of the receipt detail view. One component, so both always match.

- Paper: `--card` with a hairline border, the 8×8 perforated edge (`PerfEdge`) on top and a torn zigzag bottom (`.receipt-torn` mask in `globals.css`). No radius, no shadow.
- Head: the `Wordmark` (`wordmark` variant, 17px) centred, `DIGITAL RECEIPT · No. NNNN` below in micro caps. The receipt is branded UnReceipt; the store never gets the letterhead, so it can't pass for a receipt the store issued.
- Merchant: 48×48 `MerchantLogo` (`radius 12`), merchant name 18/700, address or category in `--ink-muted`. Date · time · `Card •••• 4421` on one Manrope 12/500 `--ink-muted` line with `tabular-nums`.
- Lines: label … dotted leader … value (`Leader`), 14px; amounts in Geist Mono. Dashed hairline rules between sections. Items show `× qty @ unit` when qty ≠ 1.
- **Total**: `TOTAL` in micro caps 14/800, amount Geist Mono 24/600 with the currency suffix 13px `--ink-muted`. VAT (with its rate) and `Excl. VAT` as leader lines under it.
- Footer: a rotated `✓ VERIFIED` stamp (2px `--brand` border, `--brand-action` text) only when UnReceipt verified the receipt; otherwise `Needs review` (`--attention-deep`), `Checked by you` (photo or manual capture) or `Read automatically` (email/SMS). `Original attached` with a paperclip when there is one. The barcode (`.receipt-barcode`, ink) appears only under a real verification code.

### Merchant logo (`MerchantLogo`)

- Store logos only for merchants on the hand-checked list in `src/lib/merchant-logos.ts`, matched on whole words; ambiguous names (SAS, Paul, Max…) stay off it. Everyone else keeps the initials badge: white initials on a colour hashed from the name, from a palette where every colour passes AA under white (`src/lib/merchant-display.ts`: action green, deep space, slate, plum, clay, teal, honey deep, berry, ink muted).
- Logos come from `/api/merchant-logo/<slug>`, which fetches the site icon server-side (the customer's IP and the merchant never reach the icon service) and is CDN-cached for 30 days. Only PNG icons of at least 64×64 px are used (a badge is 80–96 device px on a phone); smaller favicons would look blurry, so those stores keep initials.
- The initials badge shows until the logo has loaded and stays if it fails, so there is never an empty tile. A loaded logo sits on `--card` with a hairline border.

### Capture sheet (photo first)

`src/app/app/(authed)/CaptureDialog.tsx`. A bottom sheet (`radius xl (16)` top corners, max 540px wide, `min(92dvh, 760px)` tall) with a fixed header (title + 44px close button) so the way out never scrolls away. No drag handle: the sheet can't be dragged, so it doesn't draw one.

- **Stage 1: choose.** A `--surface` panel with a viewfinder line drawing, "Photograph your receipt" and one sentence on what we read. Below it: **Take photo** (primary, 54px, radius md (10)), **Upload photo or PDF** (white, hairline), and a quiet text link "No receipt? Enter it manually". Tapping the FAB never opens the camera directly.
- **Stage 2: reading.** The real photo as a 72×96 thumbnail with a brand-green scan line (2.4s loop, `transform` only), `Reading your receipt…` with a pulsing dot, and skeletons laid out like the review (amount, VAT panel, five rows). Nothing to save yet.
- **Stage 3: check and save.** Fields fade in together over `long (480ms)`.
  - Hero: photo thumbnail (with a remove control on a 44px target) + `Total paid` in Geist Mono 40px (32 / 26px for long amounts so every digit stays visible) and a 44px currency pill. The currency is the one on the receipt; without a photo it defaults to SEK on a Swedish phone, EUR otherwise.
  - VAT panel (`--brand-tint`): VAT with its rate, and the amount excl. VAT, in the receipt's currency. Only when both numbers are known.
  - One hairline card of 52px rows, label in a fixed 84px column (`--ink-muted`, 15/600), value left-aligned after it (16/700; amounts right-aligned in mono). Every value is a real input — tapping it edits in place, no second screen. Rows: Merchant, Date, Category, VAT (rate menu + amount), Payment. The focused row gets a `--ring` outline.
  - Choosing a VAT rate fills the VAT amount from the total; typing a VAT amount takes over (mixed-rate receipts). VAT printed on the receipt is never recalculated.
  - **Include VAT** switch row (on by default, remembered per device in browser storage — no profile setting during the pilot). Off hides the VAT panel and VAT row and saves no VAT; OCR still reads it, so switching back on shows it. The switch is ink when on, `--ink-faint` when off, so Save stays the one green.
  - "Add a note" reveals Notes. Without a photo, "Take photo" / "Upload file" sit next to it.
  - Footer: "Read from your photo. Tap any value to change it." when OCR filled the form, then **Save receipt** (54px).
- **Fallback.** If the photo can't be read, the same form shows with the photo still attached, an attention notice ("We couldn't read this photo…") and the title "Fill in the details". Manual entry uses the title "Enter manually" and a back button to stage 1.
- Placeholders describe the field ("Shop or company", "Card, Swish, cash…"); they never look like example data. No red asterisks: required fields are enforced on save.

### Empty state

- `64×64` brand-tint square with rounded corners (`radius xl (20)`) holding a calm line illustration of a receipt mark.
- Title `display-lg` (Manrope 700 / 22): `Your inbox is empty`.
- Body `body` (Figtree 400 / 14) in `--ink-muted`, max-width 280px, centered: `Forward your email receipts to your private inbox address. We'll have them VAT-ready in minutes.`
- Email card: `bg-card`, `border 1px hairline`, `radius lg (12)`, `padding 14 16`. The address renders in `Geist Mono 500 / 14`. Brand-green Copy button on the right (`radius 9px`, Figtree 600 13).
- FAB still present (so the customer can capture even before any email arrives).

### FAB

- `64×64` circular, `bg: --brand-action` (via `--primary`), `border: none`.
- `box-shadow: 0 8px 24px -8px rgba(31, 157, 99, 0.45), 0 2px 6px -2px rgba(23, 26, 46, 0.08)` — only place shadow exists in the system.
- Icon: white `+`, 28×28, stroke 2.5.
- Position: `fixed`, `bottom: env(safe-area-inset-bottom) + 32px`, `left: 50%`, `transform: translateX(-50%)`.
- Press: `scale(0.92)` then spring back to 1.0 over 240ms.

### Wordmark (`UnReceipt`)

Lives in `src/components/brand/Wordmark.tsx`. Four variants follow the brand book (pp. 9–11):

| Variant | Use |
|---|---|
| `horizontal` (default) | App header, footer, primary lockup |
| `stacked` | Centered narrow placements (e.g. /app/login hero) |
| `wordmark` | Text-only — when the icon is already established on the page |
| `icon` | Isotype-only — PWA icon, favicon, social profile |

- The wordmark text is **Manrope ExtraBold (800)** with `letter-spacing: -0.02em`. `Un` renders in `#303568` (Deep Space) and `Receipt` in `#27BE7B` (Green Mint) on light surfaces — the brand-book two-color split.
- The receipt-glyph isotype is rendered inline as SVG so it scales cleanly without an asset round-trip.
- The `on` prop switches the color set for non-default surfaces:
  - `on="light"` (default) — green receipt body, navy arrow, two-color wordmark
  - `on="dark"` — cream receipt body, green arrow, single-color cream wordmark (for navy backgrounds)
  - `on="mint"` — cream receipt body, navy arrow, single-color navy wordmark (for the brand-tint hero / VAT panel)
- Size via `style={{ fontSize: "Npx" }}` or a Tailwind `text-*` utility — the isotype scales relative to the wordmark cap-height.

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
| 2026-05-12 | **Wordmark realigned to brand book**: two-color Manrope ExtraBold (`Un` Deep Space + `Receipt` Green Mint) with the receipt-glyph isotype. Replaces the mono `Un` pill. | Brand book is source of truth for identity; the mono pill was an internal-design choice that diverged from the brand book and was overruled when both surfaces (marketing + product) needed to share one mark. The 2026-05-12 ink-deepening decision is reverted on the same grounds — `--ink` returns to `#303568` (brand-book Deep Space). Contrast on cream stays AAA (8.99:1) for normal text. |
| 2026-10-14 | **Cream page background confirmed** (launch-plan decision D7). Code had drifted back to mint `#ECF7E7` following an older plan; `globals.css` now matches this file: `--surface`/`--background` `#FAFAF7`, mint only via `--brand-tint`. | One source of truth. Mint as page background reads as marketing. |
| 2026-10-15 | **"Attention" honey tokens documented** (`--attention`, `-tint`, `-deep`, `-mint`). Already used for review-needed cards; now also for the plan-usage notice and the over-the-plan progress bar. | Usage warnings must read as helpful, not alarming — saving a receipt is never blocked. Red stays reserved for destructive actions. |
| 2026-10-15 | **Capture and edit forms gain VAT amount, VAT rate and payment method** (Step 2). The OCR skeleton shows one bar per revealed field (8, was 5). Inputs, selects and buttons in these forms are 44px tall; selects and textareas use 16px text on mobile so iOS doesn't zoom on focus. | Photographed receipts kept their VAT only if these fields exist; 44px is the tap-target floor. |
| 2026-10-15 | **Non-destructive errors use the honey "attention" tokens**, not red (form validation, export errors, unsupported-photo guidance). Red stays for delete flows. | Matches "red only for destructive actions"; these messages ask the user to fix something, nothing is lost. |
| 2026-10-15 | **First-run onboarding hides the FAB**; each of its 3 screens has its own call to action (step 2 opens capture). Progress dots are ink, so brand green appears once per screen (the CTA). The 64×64 brand-tint mark counts as the empty-state hero. | One obvious action per screen. |
| 2026-10-15 | **`--brand`, `--brand-deep`, `--negative`, `--destructive-foreground` defined in globals.css**; `--primary`, `--ring`, `--destructive` alias them. Motion is disabled under `prefers-reduced-motion`. | They were referenced but undefined. |
| 2026-10-16 | **Action green `--brand-action` #1A7F52** for primary buttons, the FAB and focus rings (`--primary`, `--ring` point at it); `--brand` #27BE7B stays for the wordmark and accents. **`--ink-muted` set to its spec value #5A5F7A** in globals.css (it had drifted to 65% Deep Space, 3.8:1). | White on #27BE7B is 2.4:1 and the old muted text 3.8:1 — both under WCAG AA (4.5:1). Same hue, so the brand still reads green; now 5.0:1 and 6.3:1. |
| 2026-10-16 | **Capture becomes a photo-first bottom sheet** (choose → reading → check and save), with edit-in-place rows instead of stacked input boxes, VAT worked out from the rate, and the receipt's own currency. iOS date inputs drop their native chrome (`globals.css`) so they no longer spill into the next column. | The centred dialog put nine boxes before the photo, overlapped on iPhone, scrolled its close button away and used placeholders that looked like real data. Reading the photo is the product; the form is the fallback. |
| 2026-10-16 | **VAT check panel under the digital receipt** (`VatCheckPanel`): one hairline card per finding, honey `--attention-tint` for warnings, `bg-card` for information. Amounts quoted inside a sentence ("a receipt up to 4,000 kr…") stay in the body font; the mono rule covers values on a receipt, not thresholds in prose. Seller and buyer ids render with `tabular-nums` in Manrope. | The check explains a rule; switching fonts mid-sentence reads as a value from the receipt. |
| 2026-10-16 | **Digital receipt redesign + "Receipt saved" step.** `ReceiptDetailCard` becomes a paper receipt (perforated top, torn bottom, dotted leaders, verified stamp) and is shown right after saving as well as in the detail view. VAT moves from the mint panel to leader lines under the total. Store logos for a hand-checked list of merchants, served through our own cached endpoint. Inbox gains By date / By category grouping and category chips. | The founder wanted a receipt that feels like the one on the landing page, visible the moment it's created. Logos only where we're sure of the match: a wrong logo on an accounting record is worse than initials. The footer no longer says "Awaiting verification" on receipts nobody else will verify. |

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
  - VAT as leader lines under the total (superseded the `--brand-tint` panel on 2026-10-16).

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
