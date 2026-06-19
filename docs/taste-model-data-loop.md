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

## Capture Queue

Create a queue JSON shaped like
`docs/examples/taste-capture-queue.example.json`, then generate the capture and
pair commands:

```bash
pnpm validate:taste-capture-queue -- --queue docs/examples/taste-curated-seed-queue.json --check-urls
pnpm queue:taste-captures -- --queue datasets/taste-capture-queue.json --commands reports/taste-capture-queue-commands.sh
```

For larger queues, keep URL validation bounded so the checker does not create
its own false negatives:

```bash
pnpm validate:taste-capture-queue -- --queue docs/examples/taste-curated-promotion-queue.json --check-urls --url-concurrency 6 --url-timeout-ms 20000
```

Use `docs/examples/taste-curated-seed-queue.json` as the first 10-pair
SaaS/devtool seed queue, or copy it to `datasets/taste-capture-queue.json` and
edit before running.

Use `docs/examples/taste-curated-expansion-queue.json` as the second validated
20-pair SaaS/devtool expansion queue once the first seed has been captured and
labeled.

Use `docs/examples/taste-curated-promotion-queue.json` as the third 40-pair
promotion queue after v1+v2. Together those queues produce 70 real curated
labels, enough to reserve a 50-record holdout while still leaving 20 training
records for a first promotion-gate report.

When the queue is ready to run, execute it explicitly:

```bash
pnpm queue:taste-captures -- --queue datasets/taste-capture-queue.json --execute
```

The queue captures each A/B URL to `captures/taste-queue/<queue>/<job>/` and
creates unlabeled pair manifests in `captures/taste-pairs`.

## Label Queue

Generate a local review queue from pair manifests:

```bash
pnpm review:taste-pairs -- --in captures/taste-pairs --out reports/taste-label-queue.html
```

Open the generated HTML file, compare the above-fold screenshots, then apply a
label back to the pair manifest:

```bash
pnpm label:taste-pair -- --pair captures/taste-pairs/example.json --preferred a --confidence 0.8 --rationale "Clearer hierarchy and stronger first action"
```

Use `--preferred b`, `--preferred tie`, or `--preferred unknown` when
appropriate. Add `--criteria typography:a,mobileFit:b` when a pair needs
criterion-specific labels.

Check collection progress before exporting:

```bash
pnpm audit:taste-pairs -- --in captures/taste-pairs --strict
```

## Train And Evaluate

```bash
pnpm export:taste-jsonl -- --in captures/taste-pairs --out datasets/taste-pairs.jsonl
pnpm split:taste-jsonl -- --in datasets/taste-pairs.jsonl --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl
pnpm audit:taste-jsonl -- --in datasets/taste-holdout.jsonl --strict
pnpm train:taste-ranker -- --in datasets/taste-train.jsonl --out models/taste-linear-ranker.json
pnpm report:taste-model -- --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl --model models/taste-linear-ranker.json --out reports/taste-model-report.json
```

For a promotion-gate report, make the heldout requirement explicit:

```bash
pnpm split:taste-jsonl -- --in datasets/taste-pairs.jsonl --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl --min-test-records 50
```

The report compares the mechanical baseline against the saved ranker on both
train and holdout records. The audit and report both require at least 10 real
non-synthetic held-out labels by default; synthetic-only reports are pipeline
smoke, not promotion evidence.

The report emits two separate gates:

- `comparisonReadiness`: enough real holdout labels for a product-side comparison
  and ranker holdout accuracy at least matches the mechanical baseline.
- `promotionReadiness`: stricter launch gate. Defaults require 50 real heldout
  labels, 0.70 holdout accuracy, and +0.05 accuracy over the mechanical baseline.
  Tune with `--min-promote-real-holdout`, `--min-promote-total-holdout`,
  `--min-promote-accuracy`, and `--min-promote-delta`.

Current local status as of 2026-06-19: the first 10-pair seed plus the 20-pair
expansion queue produce 30 real curated labels. A 20 train / 10 holdout report
passes the real-heldout readiness gate. The expanded
`taste-linear-evidence-ranker-v0` uses mechanical summary plus viewport artifact
metrics and is comparison-ready but not promotion-ready (`0.50` holdout accuracy
vs `0.30` mechanical baseline). Treat this as evidence to collect more labels
and move to screenshot-aware modeling before calling it a product model.

## Runtime

When a report is good enough for a product trial, set the Pages env var:

```text
TASTE_RANKER_MODEL_JSON=<contents of models/taste-linear-ranker.json>
```

The API uses this local ranker before trying the VLM or mechanical fallback.
