# Taste model data loop

Purpose: turn captured website pairs into a supervised Taste ranker with a
held-out comparison report. This is the local loop before any production
promotion.

## Bootstrap

Capture a seed page and create synthetic degradations when real labels are
scarce:

```bash
bun capture:taste -- --url https://example.com --label example
bun synth:taste-degrade -- --manifest captures/taste/example/manifest.json --out captures/taste-pairs
bun export:taste-jsonl -- --in captures/taste-pairs --out datasets/taste-pairs.jsonl
```

Manual and product-feedback pairs should also land in `captures/taste-pairs`
through `bun pair:taste`. Synthetic pairs are a bootstrap signal only; do not
use them as the final quality claim.

## Capture Queue

Create a queue JSON shaped like
`docs/examples/taste-capture-queue.example.json`, then generate the capture and
pair commands:

```bash
bun validate:taste-capture-queue -- --queue docs/examples/taste-curated-seed-queue.json --check-urls
bun queue:taste-captures -- --queue datasets/taste-capture-queue.json --commands reports/taste-capture-queue-commands.sh
```

For larger queues, keep URL validation bounded so the checker does not create
its own false negatives:

```bash
bun validate:taste-capture-queue -- --queue docs/examples/taste-curated-promotion-queue.json --check-urls --url-concurrency 6 --url-timeout-ms 20000
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
bun queue:taste-captures -- --queue datasets/taste-capture-queue.json --execute
```

The queue captures each A/B URL to `captures/taste-queue/<queue>/<job>/` and
creates unlabeled pair manifests in `captures/taste-pairs`.

## Label Queue

Generate a local review queue from pair manifests:

```bash
bun review:taste-pairs -- --in captures/taste-pairs --out reports/taste-label-queue.html
```

Open the generated HTML file, compare the above-fold screenshots, then apply a
label back to the pair manifest:

```bash
bun label:taste-pair -- --pair captures/taste-pairs/example.json --preferred a --confidence 0.8 --rationale "Clearer hierarchy and stronger first action"
```

Use `--preferred b`, `--preferred tie`, or `--preferred unknown` when
appropriate. Add `--criteria typography:a,mobileFit:b` when a pair needs
criterion-specific labels.

Check collection progress before exporting:

```bash
bun audit:taste-pairs -- --in captures/taste-pairs --strict
```

## Train And Evaluate

```bash
bun export:taste-jsonl -- --in captures/taste-pairs --out datasets/taste-pairs.jsonl
bun split:taste-jsonl -- --in datasets/taste-pairs.jsonl --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl
bun audit:taste-jsonl -- --in datasets/taste-holdout.jsonl --strict
bun train:taste-ranker -- --in datasets/taste-train.jsonl --out models/taste-linear-ranker.json
bun report:taste-model -- --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl --model models/taste-linear-ranker.json --out reports/taste-model-report.json
```

For a promotion-gate report, make the heldout requirement explicit:

```bash
bun split:taste-jsonl -- --in datasets/taste-pairs.jsonl --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl --min-test-records 50
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

## Screenshot Feature Experiment

The production ranker path is still the JSON model above. To test whether
simple screenshot pixel statistics add signal before committing to a real visual
encoder, run the offline experiment:

```bash
bun experiment:taste-screenshot-ranker -- --pairs captures/taste-pairs --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl --out reports/taste-screenshot-ranker-report.json
```

This uses Playwright to read captured above-fold PNGs through a canvas and trains
a local logistic ranker over brightness, contrast, saturation, dark/light area,
colorfulness, and edge-density deltas. It is a diagnostic, not a production
model; promote only through the main `promotionReadiness` report.

Current local status as of 2026-06-19: the first 10-pair seed, 20-pair
expansion queue, and 40-pair promotion queue have been captured and labeled
locally, producing 70 real curated labels. A promotion-gate split with
`--min-test-records 50` produced 20 train / 50 holdout records.
`taste-linear-evidence-ranker-v0` remains comparison-ready but not
promotion-ready (`0.58` holdout accuracy vs `0.34` mechanical baseline; the
promotion gate requires `0.70`). Treat this as evidence that DOM/mechanical
features are insufficient by themselves; the next model step is either more
real labels or screenshot-aware features/modeling before product promotion.

## Runtime

When a report is good enough for a product trial, set the Pages env var:

```text
TASTE_RANKER_MODEL_JSON=<contents of models/taste-linear-ranker.json>
```

The API uses this local ranker before trying the VLM or mechanical fallback.
