# Receipt OCR eval

Measures how well `extractReceipt()` (`src/lib/ocr.ts`) reads receipt photos, and compares Claude models on accuracy, cost and speed before the production model changes.

## What's in the set

`cases/synthetic.json`: 34 cases rendered by `generate.mjs` from `receipts.mjs`. The ground truth is computed from the receipt lines, so it can't disagree with the image.

- 20 Swedish, 6 French, 3 English (US, UK, an Uber trip in EUR) receipts, plus 5 things that aren't receipts (a menu, a business card, a shopping list, a store flyer, an empty desk).
- Cases that trip up a reader: a tip on top of the bill, cash paid with change given, öresavrundning, member discounts, mixed VAT rates (6/12/25 %, 0 % prescription, 5.5/10/20 % in France), US sales tax added on top, a card-terminal slip with no item lines, a 25-line grocery receipt, `dd.mm.yy` and UK `dd/mm/yyyy` dates.
- Photo conditions: flat scan, phone photo at an angle, faded thermal ink, blur, crumpled paper, upside down, digital receipt.

**Limitation:** the synthetic photos are cleaner than real ones (real fonts, shadows, creases, glare). They test whether a model reads the *right* number, not whether it can read a bad photo. Real photos decide; see below.

## Grading

All programmatic, no AI judge. Per case:

| Metric | Right when |
|---|---|
| **Correct** (headline) | receipt: total, currency and date all right · non-receipt: answered `not_a_receipt` |
| Total | `amount` within 0.01 of the total paid (after discounts, including tip) |
| Date / Currency | exact |
| Merchant | the name contains one of the case's aliases (accents and case ignored) |
| VAT | `tax_amount` within 0.02 of the summed VAT |
| Items | item count within 1 of the printed lines |
| Receipt? | receipt vs not-a-receipt classified right |

A cut-off or non-JSON answer scores 0 on every field: that's what the customer would see. An API error is not a score; it goes to `errors.jsonl` and the case is re-run on the next run.

## Running it

Needs `ANTHROPIC_API_KEY` in the environment.

```bash
evals/receipt-ocr/run-all.sh          # every model, 2 reps each
node evals/receipt-ocr/compare.mjs    # rewrite the summary from what's on disk
```

The first run stops with "no approved harness sha". Look over `run-eval.mjs` and `src/lib/ocr.ts`, then approve once:

```bash
npx tsx evals/receipt-ocr/run-eval.mjs --flow .claude/hillclimb/receipt-ocr --variant baseline --approve-harness
```

Results land in `.claude/hillclimb/receipt-ocr/` (gitignored): one folder per variant, `comparison.md` with the side-by-side table.

| Variant | Model | Settings |
|---|---|---|
| baseline | `claude-sonnet-4-6` | production today: no thinking, 4096 max tokens |
| v1 | `claude-sonnet-5-5` | effort low |
| v2 | `claude-haiku-5-5` | effort low |
| v3 | `claude-haiku-5-5` | effort medium (its default) |
| v4 | `claude-opus-5-5` | effort low, as a quality ceiling |

The newer models think before answering by default, so they get 16000 max tokens to keep thinking from cutting off the JSON.

**Cost:** about $0.01–0.03 per call, depending on the model. A full run (34 cases × 2 reps × 5 variants = 340 calls) comes to roughly $5. `comparison.md` reports the measured cost.

To check the grading without spending anything: `--fake oracle` must score 100 % and `--fake null` 0 %.

## Adding real receipts (do this before switching models)

1. Put photos in `evals/receipt-ocr/real/`. The folder is gitignored because receipts carry card digits and addresses.
2. Copy `labels.example.json` to `labels.json` and fill in one entry per photo: what's actually printed, checked by a person. Labels copied from a model's output would reward models that make the same mistakes.
3. `CASES=real evals/receipt-ocr/run-all.sh` runs the real photos only; the default `CASES=all` runs both.

Aim for 20+ real receipts, including the ones that failed in the app.
