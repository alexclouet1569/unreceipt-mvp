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
| `display-lg` | 24 / 1.15 / -0.02em | Manrope | 700 | Screen titles ("Your receipts", "Settings") |
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

On the website each row is a utility in `globals.css` (`text-display-xl`, `text-display-lg`, `text-body-lg`, `text-body`, `text-caption`, `text-micro`, `text-accent`, `text-amount-xl`, `text-amount-row`); new code uses them instead of inline `style={{ fontSize }}`. Older screens are moved over as they are touched.

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
| `--ink-faint` | `#9CA0B8` | Placeholders, the "—" of an empty value, chevrons; never text that carries information (2.6:1 on white). Dates, meta and micro caps are `--ink-muted`. |
| `--hairline` | `#E8E5DD` | 1px borders and dividers — warm gray to match the cream |
| `--negative` | `#C73E4E` | Destructive actions (delete), and **missing data**: the empty required fields of a receipt under review ("Amount · Missing", red field border) and bank payments without a receipt in the firm portal. For missing data: text and field borders only, never a background (destructive buttons keep the `--destructive` fill). 4.97:1 on white. |
| `--attention` | `#C99440` | "Needs attention" accent: review-needed left rule on receipt cards, over-the-plan progress bar. Friendly honey, never red. |
| `--attention-tint` | `#FBF1DE` | Background of attention notices (plan-usage notice above the inbox) |
| `--attention-deep` | `#8C6320` | Text and icons on `--attention-tint` (≈5:1, passes AA) |
| `--attention-mint` | `#6B9778` | Desaturated mint badge paired with the review-needed slice |
| `--skeleton` | `#EFEDE6` | Loading shapes (`loading.tsx`, the iPhone app's first load), breathing slowly; never a spinner on an empty page |

### Dark mode

Follows the device's appearance. The iPhone app has it since 2026-11-12 (`mobile/src/palette.ts`, `app.json` `userInterfaceStyle: "automatic"`); the website too (`globals.css`): the root layout marks the product host with `data-theme="auto"`, and the tokens below apply under `prefers-color-scheme: dark`. The marketing site has no dark design and stays light: its headers remove the mark on local and preview addresses, which serve both surfaces. Tailwind's `dark:` variant follows the same rule. Ratios are on `--card` `#1A1D33` unless said otherwise.

| Token | Hex | Role |
|---|---|---|
| `--surface` | `#0F1124` | Page background |
| `--card` | `#1A1D33` | Card / sheet |
| `--ink` | `#EFE8DA` | Primary text — warm off-white preserves paper feeling (13.6:1) |
| `--ink-muted` | `#A4A8C0` | Body and anything that carries information (7.1:1) |
| `--ink-faint` | `#6A6E88` | Never text that carries information (3.3:1): placeholders, the "—" of an empty value, the version line, and marks next to words that say the same (chevrons, a switch's off track, last period's chart line, the Other category) |
| `--hairline` | `#2A2D45` | Borders |
| `--brand` | `#27BE7B` | Unchanged — passes contrast on dark (6.9:1) |
| `--brand-deep` | `#1F9D63` | Hover on brand accents |
| `--brand-action` | `#27BE7B` | Filled actions, ticks, the chart's one green. The light action green is 3.3:1 on the dark card, too dark to read as a tick or line; on dark the brand green is the action. |
| `--brand-action-deep` | `#1F9D63` | Pressed |
| `--on-brand-action` | `#0F1124` | Label on a green fill: Deep Space on green, 7.8:1 (white would be 2.4:1). In light mode it is white. |
| `--brand-tint` | `#1A3A2A` | Subtle brand surfaces on dark (VAT panel, pilot box, empty-state mark); ink on it 10.2:1 |
| `--ink-fill` | `#363A5E` | Fill of the ink button and the Undo bar. On dark, ink itself is cream, and a cream fill (13.6:1 on the card) would outshine the green action the ink button must not compete with; this quiet navy stays second. In light mode it is `--ink`. |
| `--on-ink` | `#EFE8DA` | Label on `--ink-fill`, 8.9:1. In light mode it is white. |
| `--negative` | `#F0707E` | Missing data and destructive text (5.8:1). The swipe's red **fill** stays `#C73E4E` in both modes (`--destructive-fill`, white 5.0:1). |
| `--attention` | `#C99440` | Unchanged: the honey rule and field borders (6.2:1) |
| `--attention-tint` | `#33291A` | Background of attention notices |
| `--attention-deep` | `#E8B566` | Honey text (8.9:1; 7.6:1 on its tint) |
| `--attention-mint` | `#7FB08E` | The mint rule in the VAT panel |
| `--skeleton` | `#23263D` | Placeholder shapes |

Per mode, not per token:

- **Undo bar and ink buttons** fill with `--ink-fill` and write in `--on-ink`; Undo is `--brand` in both modes (4.8:1 on Deep Space, 4.5:1 on `#363A5E`).
- **Switches** stay ink on, `--ink-faint` off; the thumb is white on light and Deep Space on dark (a white thumb on a cream track can't be seen).
- **Tab badge:** iOS draws its text white, so the badge keeps the light `--attention-deep` `#8C6320` in both modes (5.4:1).
- **Photo viewer:** always on a dark ground (`#303568` light, `#0F1124` dark), never on cream.
- **Wordmark, header and empty-state marks** use the brand book's on-dark set: cream receipt with green lines and arrow, one cream colour for the wordmark. The **app-icon tile** (sign-in, status screens) is the same in both modes: navy tile, cream receipt, as the splash before it.
- **Charts:** while a bar is chosen the other bars dim to 45 %, so the choice reads by lightness and not only by hue (on dark the green and the muted bars are almost equally light). Both modes.
- **Date pickers** follow the appearance (iOS draws the inline calendar).
- **Category colours** keep their hues, lightened to at least 5.5:1 on the dark card: travel `#7D9CCB`, transport `#6AAAB8`, meals `#C98473`, accommodation `#A78BC9`, software `#8C92D6`, office supplies `#A4A8C0`, client entertainment `#D67A92`, other `--ink-faint`. Merchant initials blocks keep the light palette (white initials at AA on every colour).
- **Splash:** the navy app tile on `#0F1124`.
- **Website specifics:** the delete button and the swipe's Delete action fill with the dark `--negative` and takes Deep Space text (`--destructive-foreground`), where the iPhone keeps the red `#C73E4E` fill with white; ink-filled buttons (the demo tour's Next, Yes, share) use `--ink-fill` / `--on-ink`; the full-screen photo sits on `--photo-ground`; the wordmark reads `--mark-*` variables, which carry the on-dark set; the receipt PDF stays on white (it is a document); an email's text in the Original tab follows the theme. The sheet scrim deepens to 55 % black so a sheet's edge reads without a shadow. Pages outside this file's scope on the app host (`/admin`, `/subscribe`) follow the tokens too; their palette colours (`text-red-700`…) are not reworked. The Capacitor shell's cream status-bar bands (`capacitor.config.ts`) stay until the shell is removed.

### shadcn token mapping (so the component library inherits the system automatically)

```css
--background: var(--surface);
--foreground: var(--ink);
--card: var(--card);
--card-foreground: var(--ink);
--popover: var(--card);
--popover-foreground: var(--ink);
--primary: var(--brand-action);
--primary-foreground: var(--on-brand-action);
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
- Max content width: `540px` (centered on tablet+), header and tab bar included.

## Layout

- **Approach.** Strict single-column. Mobile-first 390px primary canvas. No sidebar, ever.
- **Header and tabs (2026-11-12).** One compact sticky header (56px, hairline under it, `--background` at 90 % with a blur) with the `UnReceipt` wordmark on the left, shared by every signed-in page (`src/app/app/(authed)/layout.tsx`, `src/components/AppNav.tsx`). The tabs — Receipts, Insights, Settings — are text links on the right of the header from 640px up, the current one with a 2px `--ink` rule on the header's hairline, and a solid bottom tab bar below 640px (`--background`, 56px plus the home-indicator inset, icon over an 11px label, hairline on top). Current tab in `--ink`, others `--ink-muted`: no green, so the capture button stays the screen's one green. The header keeps the blur it already had (the one exception to "no glassmorphism", as the iPhone's system tab bar). During a tab change the header and bar stay still above the fading page. A page inside a tab (the forwarding guide) starts with a `‹ Settings` back link instead of its own header. Replaces "No nav tabs in v1".
- **List.** Receipt cards in a single column with `8px` gaps. Date groups (`Today`, `Yesterday`, `This week`, `Earlier in May`) as `micro` labels above the relevant cluster.
- **Group and filter.** A two-option segmented control (`By date` / `By category`, 44px buttons with `aria-pressed`, `--surface` track, `--card` thumb) sits above the filter chips. By category, sections are ordered most-used first and the micro label carries the count and the total in the company's currency: a foreign receipt counts with its converted amount (`home_total`), and the total gets a leading `≈` when it includes an ECB-rate estimate. A receipt not converted yet is listed apart (`1,305.00 kr + €18.50`), never added in. The chip row (All, Review needed, then each used category) scrolls sideways; each chip is a 36px pill inside a 44px tap target, `aria-pressed`, active = `--card` with an ink border (honey for Review needed — never mint). Counts in Manrope `tabular-nums`. Tapping the active category chip again goes back to All.
- **FAB.** Fixed bottom-center, `64×64`, `--brand-action` green, `+` icon in `--on-brand-action` (white; Deep Space in dark mode). Safe-area-inset aware (Capacitor).
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
- **Route changes.** Moving between tabs crossfades in 320ms in all (old page out in 140ms on the exit curve, new page in over 260ms after 60ms on the entrance curve with a 4px rise), through React's `<ViewTransition>` and the View Transitions API; only tab links carry it, so a save or refresh never fades the page. Browsers without the API, and reduced motion, just switch.
- **Loading.** Each signed-in page has a `loading.tsx` with `--skeleton` shapes in the page's own layout, inside the shared header.
- **List items.** Fade-in on mount, no per-item stagger. Premium apps don't stagger; staggers feel app-store-template.
- **Card tap.** `transform: scale(0.985)` over 120ms, then the detail sheet slides up over 320ms. No shared-element flight (was a "risk" option — dropped to keep things calm).
- **FAB press.** Down to 0.92 in 100ms on the exit curve (no dip below it), back to 1.0 over 240ms on the gentle-overshoot curve when released.
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
- Meta row: `Figtree 500 / 13` in `--ink-muted`. Format: `Category · relative date`. `·` separators with 6px margin.
- Amount: `Geist Mono 500 / 18 / -0.01em` in `--ink`. Currency suffix `kr` at 11px in `--ink-muted`, 3px left margin, vertically aligned to baseline+1px.
- Foreign receipt: under the amount, right-aligned on the meta row, `≈ 267.98 kr` in `amount-row` (Geist Mono 14/400) `--ink-muted`, suffix split like the main amount.
- Active state: `scale(0.985)` over 120ms.
- Review needed: 3px `--attention` left rule. The meta row starts with what is missing, `Missing amount and date` (`--negative`, Manrope 600), or `To confirm` (`--attention-deep`, Manrope 600) when every field is there and the receipt only waits for a confirmation. First, so a narrow card truncates the date instead.

### Digital receipt (`ReceiptDetailCard`)

Shown right after a capture is saved (the capture sheet's "Receipt saved" step, with **PDF** and **Done**) and on the Digital tab of the receipt detail view. One component, so both always match.

- Paper: `--card` with a hairline border, the 8×8 perforated edge (`PerfEdge`) on top and a torn zigzag bottom (`.receipt-torn` mask in `globals.css`). No radius, no shadow.
- Head: the `Wordmark` (`wordmark` variant, 17px) centred, `DIGITAL RECEIPT · No. NNNN` below in micro caps. The receipt is branded UnReceipt; the store never gets the letterhead, so it can't pass for a receipt the store issued.
- Merchant: 48×48 `MerchantLogo` (`radius 12`), merchant name 18/700, address or category in `--ink-muted`. Date · time · `Card •••• 4421` on one Manrope 12/500 `--ink-muted` line with `tabular-nums`.
- Lines: label … dotted leader … value (`Leader`), 14px; amounts in Geist Mono. Dashed hairline rules between sections. Items show `× qty @ unit` when qty ≠ 1.
- **Total**: `TOTAL` in micro caps 14/800, amount Geist Mono 24/600 with the currency suffix 13px `--ink-muted`. VAT (with its rate) and `Excl. VAT` as leader lines under it.
- Foreign receipt: an `In SEK … ≈ 267.98 kr` leader under the total, and its source right-aligned below in 13px `--ink-muted` Manrope (`ECB rate of Nov 1, 2026` or `From the bank statement`).
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

### Several at once (`BatchCapture`)

- Third button on the capture sheet's first screen, secondary style: **Several at once (photos or a scan)**. It opens the photo library with multiple selection (photos and PDFs); the sheet title becomes "Several receipts".
- A multi-page PDF first shows a row asking "Is each page a receipt, or is the file one receipt?" with two 44px buttons, **Each page is a receipt** and **One receipt** (white, hairline). The status block says a scanned PDF is kept whole as the original.
- One row per photo or scanned page: a 32px status mark (spinner while reading, `--brand-action` check when saved, `--attention` dot when skipped or failed), the merchant in Manrope 700 / 15, then `Missing amount` (`--negative`, 600) or `To confirm` (`--attention-deep`, 600), and the amount in `amount-row` (Geist Mono 14/400) on the right. Rows are hairline-divided, no cards.
- A live status line on top ("Reading 3 of 12", then "11 receipts saved") with one sentence on what happens next. Footer: **Photo** and **Add more** (secondary, side by side), **Try again (n)** when something failed or the rate limit paused the queue, and **Done** (primary), disabled while files are being read, because closing the sheet stops the ones not yet sent; closing the sheet another way then asks first. The status block scrolls on its own (at most 40% of the sheet) so Done never leaves the screen. Focus moves to the status line when the batch opens. The choose panel's viewfinder shrinks to 190px so all four options fit on small phones.

### Switch (`src/components/Switch.tsx`)

The one on/off control: a 44px tap target holding a 44×26 track, `--ink` when on and `--ink-muted` when off (faint was 2.6:1, under the 3:1 a control needs) (so a screen's primary action stays its one green), 20px `--card` thumb (white; navy on the cream track of dark mode), colour 100ms, thumb 200ms on the entrance curve. Labelled by the visible title (`aria-labelledby`) and described by the line under it. While saving it stays focusable (`aria-disabled`) and ignores presses. Used for Include VAT, the firm's weekly reminder per client, and the client's own weekly-reminder opt-out.

### Swipe to delete

`src/components/receipt/SwipeToDelete.tsx`, around each receipt card on `/app`. Swipe a card left (touch or pen) and it slides to reveal an 88px **Delete** action on `--destructive` with `--destructive-foreground` text and a trash icon (4.97:1); tapping it deletes. A swipe alone never deletes. Past the button the card follows at half speed; let go beyond half the button and it stays open (200ms, entrance curve), otherwise it slides back (exit curve). The action exists only while the card is moved, so pressing a card never shows red behind it. One row open at a time; tapping elsewhere, scrolling, or tapping the open card closes it.
- **Undo, not a confirm dialog.** The card disappears at once and a bar above the capture button says "Deleted <merchant>" with **Undo** (44px, `--brand-action`) for 5 seconds; only then does the server delete it. Leaving the app or deleting another receipt sends it straight away. If the server refuses, the receipt comes back with an attention notice, scrolled into view.
- Keyboard and screen-reader users delete from the receipt's detail view (with its "Confirm delete" step); if a Delete action had focus, focus moves to Undo. The card's focus ring is drawn inside it so the clipping wrapper can't hide it.
- Mobile Safari (not the app) uses edge swipes for back / forward: a swipe that starts at the screen's edge may navigate instead.

### Photo viewer

`src/components/receipt/PhotoViewer.tsx` + `ZoomableImage.tsx`. Opens when the photo thumbnail in the capture sheet, or the photo in a saved receipt's **Original** tab, is tapped, so the details can be checked against the photo.

- Full screen on `--photo-ground` (Deep Space; `#0F1124` in dark mode), white text: the photo is the only thing on screen, and the dark ground lets a white receipt stand out. Header: "Your photo" (15/700) and a 44px close button.
- Pinch to zoom (100–500 %), double-tap to zoom to 250 % at the tapped point and back, drag when zoomed; the photo never leaves its frame. Below it, 44px **−** / **+** buttons with the zoom level, for a mouse or one-handed use.
- In the capture sheet only: **Delete photo** (white button, `--destructive` text, trash icon) removes the photo and closes the viewer, same as the thumbnail's remove control; focus moves to "Take photo". A saved receipt's original is its evidence and has no delete here (title "Original" there).
- Content on `--ink` is white: text, the 1px white/40 border of the ± buttons, and the focus ring (white/60, because `--ring` on `--ink` is 2.3:1). Icon buttons use radius md (10). Opens and closes with a short (200ms) fade.
- In the iOS app the site isn't `viewport-fit=cover` yet (`capacitor.config.ts`), so the cream bands above and below the web view stay cream: the viewer fills the web view, not the whole screen. That changes with the `viewport-fit=cover` step.
- Known gap: a zoomed photo can be moved with touch or a mouse only, not the keyboard.

### Empty state

- `64×64` brand-tint square with rounded corners (`radius xl (20)`) holding a calm line illustration of a receipt mark.
- Title `display-lg` (Manrope 700 / 22): `Your inbox is empty`.
- Body `body` (Figtree 400 / 14) in `--ink-muted`, max-width 280px, centered: `Forward your email receipts to your private inbox address. We'll have them VAT-ready in minutes.`
- Email card: `bg-card`, `border 1px hairline`, `radius lg (12)`, `padding 14 16`. The address renders in `Geist Mono 500 / 14`. Brand-green Copy button on the right (`radius 9px`, Figtree 600 13).
- FAB still present (so the customer can capture even before any email arrives).

### Setup guide illustrations (`/app/settings/forwarding`)

Drawn close-ups of another app's screen (Gmail, Outlook, iCloud, a phone mail app) that show one action at a time, next to a numbered checklist.

- **Close-ups, not miniatures.** Each picture shows only the region around the button to press (a corner, a tab bar, a dialog), drawn at readable size: text inside is 12–14px at 328px width. A whole page scaled to a phone is unreadable.
- **Drawn in our tokens, not theirs.** Frame and content use `--card`, `--surface`, `--hairline`, `--ink`/`--ink-muted`/`--ink-faint`, Manrope. No third-party logos or brand colours; the browser frame's address bar (`mail.google.com`) says where you are. Dialogs inside a picture get a hairline border, never a shadow.
- **Target.** The control to press gets a 2px `--ring` outline, radius matching the control, and a ring that pulses outwards 3 times (1.2s each, entrance easing) then stays still. Controls to leave alone get a dashed `--ink-faint` outline and a "Leave" tag.
- **Cursor.** A small ink arrow (desktop) or a fingertip dot (phone) glides from the picture's corner to the target over 320ms (entrance easing), then taps: scale 0.9 → 1 over 200ms. It plays once each time an action becomes current; "Show again" replays it. Never an endless loop: the user is reading another tab.
- **Reduced motion.** No glide, no pulse: the cursor sits on the target and the outline is static.
- **Checklist.** Numbered rows; done rows show a check in `--ink`, the current row is expanded (its button or copy field) and marked `aria-current="step"`. Rows are buttons, 44px tall minimum. The picture is `role="img"` with the action as its label; all information lives in the text.

### FAB

- `64×64` circular, `bg: --brand-action` (via `--primary`), `border: none`.
- `box-shadow: 0 8px 24px -8px rgba(31, 157, 99, 0.45), 0 2px 6px -2px rgba(23, 26, 46, 0.08)` — only place shadow exists in the system.
- Icon: `+` in `--on-brand-action` (white; Deep Space on the dark-mode green), 28×28, stroke 2.5.
- Position: `fixed`, `bottom: env(safe-area-inset-bottom) + 32px` (on a phone with the tab bar: 16px above it, `--fab-bottom` in globals.css), `left: 50%`, `transform: translateX(-50%)`.
- Press: `scale(0.92)` then spring back to 1.0 over 240ms.

### Wordmark (`UnReceipt`)

Lives in `src/components/brand/Wordmark.tsx`. Four variants follow the brand book (pp. 9–11):

| Variant | Use |
|---|---|
| `horizontal` (default) | App header, footer, primary lockup |
| `stacked` | Centered narrow placements (e.g. /app/login hero) |
| `wordmark` | Text-only — when the icon is already established on the page |
| `icon` | Isotype-only — PWA icon, favicon, social profile |

- The wordmark text is **Manrope ExtraBold (800)** with `letter-spacing: -0.02em`. `Un` renders in `#303568` (Deep Space) and `Receipt` in `#27BE7B` (Green Mint) on light surfaces — the brand-book two-color split. In the product's dark mode the default set switches by itself to the on-dark set (`--mark-*` variables in `globals.css`).
- The receipt-glyph isotype is rendered inline as SVG so it scales cleanly without an asset round-trip.
- The `on` prop switches the color set for non-default surfaces:
  - `on="light"` (default) — green receipt body, navy arrow, two-color wordmark
  - `on="dark"` — cream receipt body, green arrow, single-color cream wordmark (for navy backgrounds)
  - `on="mint"` — cream receipt body, navy arrow, single-color navy wordmark (for the brand-tint hero / VAT panel)
- Size via `style={{ fontSize: "Npx" }}` or a Tailwind `text-*` utility — the isotype scales relative to the wordmark cap-height.

### Native iPhone app (`mobile/`)

The same tokens, fonts and rules, in `mobile/src/theme.ts` (colours in `mobile/src/palette.ts`, light and dark, chosen by the iPhone's appearance: see "Dark mode"; screens read them with `useColors()` or a `makeStyles()` hook, never a module-level constant). Where this section says white or cream for a surface, read `--card` and `--surface`: they are navy on dark. Where iOS draws its own chrome, the app uses it as is, because that is what makes it feel native:

- **Tab bar:** the system tab bar (Liquid Glass on iOS 26) with SF Symbols, tinted `--brand-action`. The one exception to "no glassmorphism": it is the platform's, not ours. The Receipts tab carries a badge with the number of receipts to confirm, on honey `#8C6320` in both modes (never system red; see "Dark mode").
- **Headers:** the native large title (Manrope 700) on `--surface`, no hairline under it, shrinking into the bar on scroll. Back is the system chevron. On Receipts the bar carries the UnReceipt isotype and wordmark instead, as the website's header; the other tabs and pushed screens keep the large title.
- **Alerts and the share sheet** are the system's.
- **Text colour:** anything that carries information (meta rows, labels, section titles, converted amounts, currency signs) is `--ink-muted`, which passes AA on card and cream. `--ink-faint` is kept for placeholders, the "—" of an empty value and the version line.
- **Touch:** everything tappable springs to `scale(0.985)` under the finger (`0.97` for buttons, `0.94` for small pills) on the UI thread; list cards wait 90 ms first, so a scroll doesn't twitch them. Haptics: a light tap on primary buttons, success on a correct code or a copy, error with a shake on a wrong code. Messages that appear (errors, "Copied", "New code sent") are announced to VoiceOver.
- **Errors** that aren't missing data (invalid email, wrong code, no connection) are honey: `--attention-deep` text, `--attention` field border.
- **Loading:** the saved list shows at once; only a first-ever load shows placeholder cards (`--skeleton` `#EFEDE6` shapes in the receipt card layout, a 480 ms breathing pulse). No spinner in the middle of an empty screen.
- **List:** "To confirm" first (micro label in `--attention-deep` with the count), then Today / Yesterday / This week / month names. Cards as specified above, with the honey left rule; merchant blocks use the website's palette and hash (`src/lib/merchant-display.ts`, copied and tested in `mobile/src/lib/merchant.ts`).
- **Detail:** the perforated edge (8 pt holes every 16 pt, as the website) on top of a white card with a hairline border, the total in `amount-display` (stepping down to 32 / 26 for long amounts, never wrapping), the converted amount in `amount-row` with its source in Manrope below. Missing fields: red text, no background. To confirm: the honey band. Complete: no stamp.
- **Empty state:** the bare isotype (cream receipt, navy outline and arrow, green lines) in the 64×64 mint square.
- **First run** (the website's three steps, inside the Receipts screen until finished or skipped): progress dots (steps reached in ink, the current one wider), the 64×64 mint square (the isotype, then `doc.viewfinder` and a check in ink), `display-lg` title, `--ink-muted` body, then one green button per step with an outline second choice (never the green plain button: one green per step): *Your private receipts address* (the address card with its Copy button in ink outline, a link to the forwarding guide; Next / Skip intro), *Scan your first receipt* (Scan a receipt opens the scanner and a scan on its way moves on / I'll do it later), *You're all set* (Go to my receipts). The scan button hides meanwhile, as on the website; scans on their way still show under it. It starts only on the server's own answer (not the saved copy) and, once finished or skipped, never comes back on this phone, even before the server has recorded it. VoiceOver moves to each new step's title.
- **Scan button (FAB):** the spec above, with two app changes: the icon is the SF Symbol `doc.viewfinder` (it scans, it doesn't "add") in `--on-brand-action` (white on light, Deep Space on the dark green), and a tap opens Apple's document scanner directly, because the scanner *is* the capture flow (it finds the edges and shoots by itself). Touch and hold, or the photo icon in the header (ink, so the button stays the screen's only green), picks photos. A light haptic on tap. It floats above the tab bar (react-native-screens' SafeAreaView knows the bar's height) on every state of the Receipts screen, loading and offline included.
- **Scans on their way:** a card like a receipt's with the scan's own 40×40 picture and "Reading your receipt…" and a spinner; waiting offline it says it is saved on the iPhone, with a still clock instead of the spinner. Not a receipt, or not sent after 8 tries: the honey left rule, the reason, and **Try again** (`--brand-action`) / **Remove** (`--negative`: it throws the picture away). It fades out and the receipt fades in. One success haptic per batch.
- **Swipe to delete:** as specified above. The red action is drawn only while the card moves and is hidden from VoiceOver, which deletes through the card's own "Delete receipt" action. The **Undo** bar (`--ink-fill`, `--on-ink` text) sits just above the scan button; its Undo label is `--brand`, not `--brand-action`, because on ink `--brand` is 4.8:1 and `--brand-action` 2.3:1. With VoiceOver on, focus moves to Undo and the window is 15 s instead of 5.
- **Receipt page:** the photo (220 pt, hairline, radius 12, breathing placeholder while it loads, hidden if it can't) above the paper card. Merchant, amount, date and category each end in a chevron and open their own iOS bottom sheet (grabber, radius 16): merchant text, amount in Geist Mono with currency pills (the filter-chip style), an inline calendar, the category list with a check. A sheet closes on Save at once; a refused change comes back with a message. A missing field reads "Add amount" (red text) and the main button becomes that action until the receipt is complete, then **Confirm receipt**.
- **Photo viewer:** the spec above as a page sheet (swipe down to close) titled "Receipt photo", pinch and double-tap zoom, no ± buttons (VoiceOver zooms by swiping up and down on the photo instead). The close button sits on a 70 % ink circle (`--ink-scrim`) and the title has an ink text shadow, so both stay readable over a zoomed white receipt.
- **Receipts header (as the website's dashboard, founder's request 2026-11-11):** the bar shows the UnReceipt isotype (the website's light mark: green receipt, cream lines, navy arrow, no tile) and wordmark (no large title on this screen). Under it: the mint pilot box while the pilot runs (sparkles, one line of copy, an × that hides it for good on this phone; never "free", which would imply a price), "Your receipts" (`display-lg`) with the email below (`--ink-muted`), the website's three white hairline stat boxes in a row (Receipts, Verified, and the month's total in `amount-row` Geist Mono, shrinking a little rather than cutting digits; tapping it opens iOS's action sheet with the months and "All time"), the By date / By category switch (cream track, white thumb, 44 pt), and the chips: All, To confirm (honey count, honey border when active), then each category, most used first. By category, each section reads "Travel · 3" in the micro label with its total on the right in Geist Mono 12 pt `--ink-muted` (`≈` when it includes an ECB estimate, an unconverted foreign amount after a `+`). In the stat box the month shows short ("Sep 2025"), the long name in the picker; a long amount steps down to 12 pt and grows at most 1.2× with the user's text size, so its digits stay whole. The list isn't cut by month, as on the website. After the newest 50, an outline **Show older receipts** button at the end loads the next 50 after the last receipt shown (`GET /api/mobile/receipts?after=`, so a receipt added or deleted meanwhile never makes one go missing); they open, change and delete like the others, don't fade in as new arrivals, and the stat boxes keep counting from the server's summary, never twice. VoiceOver hears how many were added, or that it failed (honey line).
- **Accountant invite card:** under "Your receipts" and the email (the website's order: pilot box, title, invite), white hairline card: "Share your receipts with {firm}?" (`body-lg`), one line of `--ink-muted`, then **Yes, share** filled in ink and **No thanks** outlined, side by side. Not green: the scan button stays the screen's only green action. Its answer replaces the card for 4 s, then it fades.
- **Account tab:** iOS Settings-style grouped lists: micro section titles, white hairline cards with hairline separators, 52 pt rows (Manrope 600 label, optional `--ink-muted` detail line, value and chevron on the right). Rows push their screen (large title): Export receipts (one tap per month, year or everything; the ZIP opens in the share sheet), Currency (checkmark list in `--brand-action`), Your accountant, Automatic forwarding. Language is a row whose value is the app's language and which opens the app's page in the Settings app. Sign out is a red row in its own group; Delete account is a red row further down, alone at the end above the version, as in iOS Settings. Switches (the accountant's weekly reminder): `--ink` on, `--ink-faint` off (the website moved its off track to `--ink-muted` on 2026-11-12 for 3:1; the app still has to follow). Problems are iOS alerts in the app's language, so they are seen wherever the tapped row was.
- **Buttons:** besides the green primary and the plain text button, an **ink** filled button (a second action that must not compete with the green one) and an **outline** button (white, hairline border, ink text) for the other choice of a pair.
- **Forwarding guide:** one step per screen, like the website's wizard: "Step n of N" (micro), the chapter (caption), the step in `body-lg` with the quoted button names in Manrope 700, then what the step needs (the copy card with its Copy button in ink outline, so Next stays the screen's one green; word chips that copy on tap; "Open in Safari"; the Gmail code in Manrope 700 32 pt with tabular figures — a code, not money, so not mono), and a `--ink-muted` hint. **Back** (outline) and **Next** (green) in a bar at the bottom within thumb reach. The mail-language pills (English / Svenska / Français) sit under the step counter for Gmail, Outlook and iCloud.
- **Delete account:** body text, then two hairline cards: "1 · Save your receipts first" (Export everything, outline) with a switch "I've saved the receipts I need to keep" (ink, like every switch), and "2 · Delete" with the red text button, then an iOS destructive alert. A new email code, when the server asks for one, uses the sign-in's six cells. While the account loads: placeholder shapes, never a spinner. Also reachable from the firm-only and inactive screens (where Sign out becomes the outline button, so the two don't look alike) in a page sheet with Cancel on the leading side and the title centred.

### Charts and Insights

The Insights tab (iPhone first, `mobile/src/app/(app)/insights/`; the website follows). One screen of numbers that can be read in five seconds and checked in one tap.

- **Order:** period switch (Month / Quarter / Year / Dates, the By date / By category track with four options), `‹ November 2026 ›`, the hero, the chart, *Worth knowing*, *Where it goes*, *Top merchants*, *VAT on these receipts*, *Not in these numbers*.
- **Hero:** `SPENT` in micro caps, the total in `amount-display` (Geist Mono, stepping down for long amounts, sized from the final value so it doesn't jump mid-roll), rolling to each new value over ~420 ms on the entrance curve (instant under Reduce Motion). Tapping it opens the period's receipts. Under it, change chips: white, hairline, ink text, `pill` radius. **Change is neutral**: spending more is not red, spending less is not green. Then `12 receipts · Includes 2 receipts to confirm` and any amount not converted yet, in `--ink-muted`.
- **Colour in charts:** bars `--ink-muted`; the bar under the finger (or today's) `--brand-action`, the screen's one green; the period before as `--hairline` ghosts behind the bars. A month is a running total: this month's line `--brand-action` 2.5 pt up to today, last month's `--ink-faint` 2 pt behind it (a hairline line was too faint to read, 1.2:1), a dot on today; the legend names the months. Bars rounded 3 pt, a 1 px hairline baseline, no grid, no axis numbers, no gradients, no shadows. Bar labels Manrope 500 10 pt `--ink-muted`, centred on their bar, thinned by their measured length so they are never cut.
- **Categories** use the merchant palette (`src/lib/merchant-display.ts`) without its action green (the chart's) and honey (it means "needs you"), `--ink-faint` for Other; one fixed colour each, never new hues: one 10 pt stacked bar (2 pt gaps) above a hairline card of rows (12 pt dot, name, `3 receipts · 42 % · +12 %`, amount in `amount-row`, chevron). Merchants: the same rows with the 36 pt initials block.
- **Reading a chart:** slide sideways over it (a vertical swipe still scrolls): a selection tick per bar, never past today; the readout above the chart, up to two lines (words in Manrope, amounts in Geist Mono); the selection clears 1.6 s after the finger lifts. VoiceOver: the chart is one adjustable element with a summary label; swipe up/down moves bar by bar.
- **Findings** (*Worth knowing*, at most three): hairline cards with a 32 pt SF Symbol tile on `--surface`, title `merchant-name` style, one `caption` line with its amounts in Geist Mono. Possible duplicates get the honey left rule (it asks for something). Every card opens the receipts behind it.
- **VAT panel:** the one mint (`--brand-tint`) surface on the screen (the "VAT-summary panel" this file reserves mint for). Label left, amount right in mono (no dotted leaders: one-sided dotted borders draw solid on iOS); for a Swedish company in kronor a 1 px `--attention-mint` rule then *At Swedish rates, confirmed*, *Client entertainment*, *To check (n)*. The note under it always says it isn't a VAT return and never says "deductible".
- **Loading:** shapes of the hero and bars breathing (`--skeleton`), only the first time; a new period keeps the previous numbers at 45 % opacity until its own arrive. Empty period: a white hairline card explaining what will show. Under three receipts, a one-line note that charts need a few more.
- **Swipe between periods:** sideways anywhere below the period switch goes to the period before (finger to the right) or after; the content follows the finger a third of the way (a tenth where there is nothing, never into the future) and springs back as the new period loads, with a selection haptic; a flick counts only in the direction of the drag, and the page doesn't scroll up and down during a sideways swipe. Under Reduce Motion the content stays still. On a chart the finger reads the bars instead. The ‹ › arrows stay, for VoiceOver and a tap.
- **Drill-down:** the total, every category, merchant, finding and *To check* push *Receipts* (the list's cards) in the same tab, and a receipt opens there too; deleting one shows the same Undo bar. The *Dates* sheet is iOS's: Cancel leading, title centred, Show trailing.
- **Website (`/app/insights`, 2026-11-12):** the same order and rules, read on the server (the period in the address, `?period=&anchor=` or `&from=&to=`, so reload and Back keep it). The period switch and the ‹ › arrows are links; *Dates* shows a From / To form under the switch. Charts are hand-built SVG (`src/components/charts/`): read by moving the pointer along them, or by focusing them and using the arrow keys (Home / End / Escape), with the readout above and a polite status line for screen readers; unchosen bars dim to 45 % while one is chosen. Category colours are CSS variables (`--category-*` in `globals.css`), one per category. Every number links to `/app/insights/receipts` (the list's cards, the receipt sheet on tap, at most 200). The `/demo/company` tour has an Insights step added up in the browser from its sample receipts, with nothing to open.

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
| 2026-11-05 | **Totals in the company's currency.** Foreign receipts keep their own amount and also show it converted (ECB reference rate of the purchase day, or the amount from the bank statement); inbox totals add the converted amounts, marked `≈` while any of them is an ECB estimate. Replaces "total per currency, never converted". | A Swedish company books in kronor; a total split into kr + € made the founder (rightly) read it as wrong, and the accountant had to convert by hand. |
| 2026-11-04 | **Firm portal (`/firm`) is desktop-first**: 1040px max width, data tables and a top nav are allowed there; same tokens, fonts, hairline cards (no shadow) and mono amounts. Below 640px tables may scroll horizontally or collapse to the inbox card list. Tap targets stay 44px and inputs 16px. | Accountants work on laptops over many clients at once; the single-column product rules were written for one person's inbox on a phone. |
| 2026-10-16 | **Action green `--brand-action` #1A7F52** for primary buttons, the FAB and focus rings (`--primary`, `--ring` point at it); `--brand` #27BE7B stays for the wordmark and accents. **`--ink-muted` set to its spec value #5A5F7A** in globals.css (it had drifted to 65% Deep Space, 3.8:1). | White on #27BE7B is 2.4:1 and the old muted text 3.8:1 — both under WCAG AA (4.5:1). Same hue, so the brand still reads green; now 5.0:1 and 6.3:1. |
| 2026-10-16 | **Capture becomes a photo-first bottom sheet** (choose → reading → check and save), with edit-in-place rows instead of stacked input boxes, VAT worked out from the rate, and the receipt's own currency. iOS date inputs drop their native chrome (`globals.css`) so they no longer spill into the next column. | The centred dialog put nine boxes before the photo, overlapped on iPhone, scrolled its close button away and used placeholders that looked like real data. Reading the photo is the product; the form is the fallback. |
| 2026-10-16 | **Digital receipt redesign + "Receipt saved" step.** `ReceiptDetailCard` becomes a paper receipt (perforated top, torn bottom, dotted leaders, verified stamp) and is shown right after saving as well as in the detail view. VAT moves from the mint panel to leader lines under the total. Store logos for a hand-checked list of merchants, served through our own cached endpoint. Inbox gains By date / By category grouping and category chips. | The founder wanted a receipt that feels like the one on the landing page, visible the moment it's created. Logos only where we're sure of the match: a wrong logo on an accounting record is worse than initials. The footer no longer says "Awaiting verification" on receipts nobody else will verify. |
| 2026-11-07 | **Photo viewer**: tap a receipt photo (capture sheet, Original tab) to see it full screen on `--ink`, pinch / double-tap / ± to zoom; "Delete photo" in the capture sheet only. | The founder wanted to check the read values against the photo; a 64px thumbnail can't show the small print. The original of a saved receipt is evidence, so it can't be deleted from the viewer. |
| 2026-11-08 | **Swipe left to delete a receipt** on `/app`: reveals a red Delete action, tapping it deletes; the row disappears immediately with 5 s to Undo, and returns if the server refuses. | The founder wanted the iOS-native way to remove a receipt from the list. Two gestures (swipe, then tap) keep a stray swipe from deleting an accounting record. |
| 2026-11-08 | **Missing is red, and only what is missing.** The "Review needed" form loses its honey background; each empty required field gets a red label suffix (`· Missing`) and a red border (`aria-invalid`), which go away as it is filled in. The panel names the missing fields ("Missing: amount and date.") or says merchant, amount and date are filled in and asks for a confirmation (button "Confirm receipt"). The inbox card starts its meta row with `Missing amount` (red) or `To confirm` (honey) instead of ending it with `needs review`. The firm portal's bank check shows payments without a receipt in red. Amends the 2026-10-15 "red only for delete" rule for missing data; other non-destructive errors stay honey. | Founder feedback: the whole honey panel didn't say what was missing, and a receipt with every field filled still said "Fill the missing fields". Red on just the gaps reads as "this is missing" at a glance. |
| 2026-11-08 | **Setup guide illustrations**: the forwarding guide shows one action at a time with a drawn close-up of the other app's screen (target outlined in `--ring`, a cursor that glides there once, 3 pulses, still under reduced motion) next to a numbered checklist. Button names follow the language of the user's mail (EN/SV/FR switch). | 8 clicks in one breadcrumb were too many to follow while switching tabs; Swedish and French users don't see English button names. |
| 2026-11-09 | **Native iPhone app** (`mobile/`, Expo): system tab bar, native large titles and alerts instead of web chrome; informative text in `--ink-muted` instead of `--ink-faint`; non-destructive errors honey; no "complete" stamp on a receipt. See "Native iPhone app" above. | The founder found the web-in-a-frame app felt "solid", not alive. Native chrome, touch feedback and haptics fix that; `--ink-faint` is 2.6:1 on white, too faint for text that carries information on a phone in daylight. |
| 2026-11-10 | **iPhone app, scanning and editing** (`mobile/`): the FAB scans directly with Apple's document scanner (`doc.viewfinder` icon; touch and hold picks photos); scans show at once with their picture and wait on the phone offline; fields are edited one per iOS bottom sheet; swipe to delete with the Undo bar above the FAB (Undo in `--brand` on ink for contrast); the photo viewer is a page sheet with VoiceOver zoom. See "Native iPhone app". | The scanner is the capture: a sheet in front of it would be one tap more for the one thing people do daily. Per-field sheets are how iOS edits one value (Settings, Contacts) and keep each screen to one decision. |
| 2026-11-11 | **iPhone app catches up with the website** (`mobile/`): a compact Receipts header (month total with iOS's action sheet for the month, counts, category chips), the accountant invite card (ink accept, not green), an iOS Settings-style Account tab (export to the share sheet, currency, accountant, delete account, forwarding guide one step per screen with a bottom Back/Next bar), ink and outline buttons. See "Native iPhone app". | The founder found build 2 thin next to the website. The website's three stat boxes and By date / By category switch would push the receipts below the fold on a phone; one card and one chip row keep them high. Settings-style lists are what iOS users expect for account options. |
| 2026-11-11 | **Receipts screen matches the website's dashboard** (`mobile/`): wordmark in the bar, "Your receipts" + email, the pilot box, the three stat boxes, By date / By category, and the chips with To confirm. Replaces the compact one-card header of the same day. | The founder wants the app to look and work like the web app; the compact header was a phone-first guess that read as "less" than the website. |
| 2026-11-11 | **Insights tab** (`mobile/`): a third tab with spending by period, a running-total chart for a month and bars for longer periods, findings, categories and merchants in the merchant palette, and the VAT on the receipts on the mint panel. Change chips are ink, not red/green. See "Charts and Insights". | The founder asked for statistics people can analyse. Charts take their colour from tokens already in the system; a running total shows "am I spending faster than last month?" better than 30 thin daily bars for a business with 15 receipts a month. VAT wording reviewed: never a deduction claim. |
| 2026-11-12 | **Dark mode in the iPhone app**: it follows the iPhone's appearance (`userInterfaceStyle: "automatic"`, a new build). The dark table above gains the action green, honey and red values and the per-mode rules (labels on green and ink fills, Undo, switch thumb, badge, photo ground, on-dark marks, category colours). A test checks the contrast of every pair the app draws in both palettes. | iPhone users run dark mode at night; a cream screen at 23:00 was the most visible "not premium" gap left. The dark action green is the brand green because the light one is too dark to read on navy, and a green fill then takes dark text, never white. |
| 2026-11-12 | **Website foundations**: one shared header with tabs (bottom bar below 640px), `loading.tsx` skeletons on `--skeleton`, saved edits and deletes shown at once while the page refreshes behind them, the receipt as a bottom sheet on phones, a crossfade between tabs, 540px content width, the FAB 32px above the home indicator (16px above the tab bar on phones) pressing down without overshoot, the list fading in once. `--hairline` and `--ink-faint` back to their table values (they had drifted to a 12 % navy and to the muted colour). Every use of faint that carries information now says `--ink-muted`, so it looks as before; placeholders become truly faint (they no longer read like typed values); the switch's off track becomes `--ink-muted` by rule (faint failed 3:1). The type-scale utilities are named `type-*` so tailwind-merge doesn't drop them as colours. Non-destructive errors in the receipt sheet are honey, no shadows on sheets or menus. | Insights needs a second place to go, and a settings icon in the corner doesn't scale to three. The bottom bar is where the thumb is; links in the header are what a laptop expects. The rest are the off-spec gaps found in the 2026-11-11 review. |
| 2026-11-12 | **Dark mode on the website** (product only): the same dark values as the iPhone app in `globals.css`, switched by the device setting on the product host (`data-theme="auto"` from the root layout); `--on-brand-action`, `--ink-fill`/`--on-ink`, `--photo-ground` and the wordmark's `--mark-*` added so no surface keeps a light-only colour; category colours lightened as on the iPhone. The marketing site stays light. | Same reason as the app: a cream page at night was the most visible "not premium" gap. The marketing pages were never designed dark and are out of this file's scope, so they don't follow. |

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
