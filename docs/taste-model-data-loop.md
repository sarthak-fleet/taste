# Taste model data loop

Purpose: turn captured website pairs into a supervised Taste ranker with a
held-out comparison report. This is the local loop before any production
promotion.

## Bootstrap

Capture a seed page and create synthetic degradations when real labels are
scarce:

```bash
pnpm capture:taste -- --url https://example.com --label example
pnpm synth:taste-degrade -- --manifest captures/taste/example/manifest.json --out captures/taste-pairs
pnpm export:taste-jsonl -- --in captures/taste-pairs --out datasets/taste-pairs.jsonl
```

Manual and product-feedback pairs should also land in `captures/taste-pairs`
through `pnpm pair:taste`. Synthetic pairs are a bootstrap signal only; do not
use them as the final quality claim.

## Train And Evaluate

```bash
pnpm split:taste-jsonl -- --in datasets/taste-pairs.jsonl --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl
pnpm train:taste-ranker -- --in datasets/taste-train.jsonl --out models/taste-linear-ranker.json
pnpm report:taste-model -- --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl --model models/taste-linear-ranker.json --out reports/taste-model-report.json
```

The report compares the mechanical baseline against the saved ranker on both
train and holdout records. Treat reports with fewer than 10 held-out labels as
pipeline smoke only.

## Runtime

When a report is good enough for a product trial, set the Pages env var:

```text
TASTE_RANKER_MODEL_JSON=<contents of models/taste-linear-ranker.json>
```

The API uses this local ranker before trying the VLM or mechanical fallback.
