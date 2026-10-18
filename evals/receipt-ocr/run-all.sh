#!/usr/bin/env bash
# Runs every candidate model over the receipt set, then writes the comparison
# (comparison.md) and the per-case report (report.html).
#
#   evals/receipt-ocr/run-all.sh                                   # 2 reps each
#   REPS=1 CASES=real evals/receipt-ocr/run-all.sh                 # real photos only
#
# Re-running resumes: finished (case, rep) pairs are skipped.
set -euo pipefail
cd "$(dirname "$0")/../.."

# The key lives under its own name in the cloud environment: an
# ANTHROPIC_API_KEY there could also be picked up by Claude Code itself.
if [[ -n ${UNRECEIPT_EVAL_ANTHROPIC_KEY:-} ]]; then export ANTHROPIC_API_KEY=$UNRECEIPT_EVAL_ANTHROPIC_KEY; fi
if [[ -z ${ANTHROPIC_API_KEY:-} ]]; then echo "Set UNRECEIPT_EVAL_ANTHROPIC_KEY (see evals/receipt-ocr/README.md)" >&2; exit 2; fi

FLOW=.claude/hillclimb/receipt-ocr
REPS=${REPS:-2}
CASES=${CASES:-all}
REPORT=${REPORT_BUILDER:-}

# variant | model | effort | max tokens | description
VARIANTS=(
  "baseline|claude-sonnet-4-6|||Production today: Sonnet 4.6, no thinking, 4096 max tokens"
  "v1|claude-sonnet-5-5|low|16000|Sonnet 5.5, effort low"
  "v2|claude-haiku-5-5|low|16000|Haiku 5.5, effort low"
  "v3|claude-haiku-5-5|medium|16000|Haiku 5.5, effort medium (its default)"
  "v4|claude-opus-5-5|low|16000|Opus 5.5, effort low (quality ceiling)"
)

for spec in "${VARIANTS[@]}"; do
  IFS='|' read -r variant model effort max desc <<<"$spec"
  mkdir -p "$FLOW/$variant"
  printf '# %s\n\n%s\n' "$variant" "$desc" >"$FLOW/$variant/change.md"
  args=(--flow "$FLOW" --variant "$variant" --model "$model" --reps "$REPS" --cases "$CASES")
  [[ -n $effort ]] && args+=(--effort "$effort")
  [[ -n $max ]] && args+=(--max-tokens "$max")
  echo "== $variant: $desc"
  npx tsx evals/receipt-ocr/run-eval.mjs "${args[@]}" || echo "   ($variant had failed cases - see $FLOW/$variant/errors.jsonl)"
done

node evals/receipt-ocr/compare.mjs "$FLOW" >/dev/null
echo "Comparison: $FLOW/comparison.md"
if [[ -n $REPORT ]]; then node "$REPORT" "$FLOW/"; fi
