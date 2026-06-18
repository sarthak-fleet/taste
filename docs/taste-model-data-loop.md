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

Use `docs/examples/taste-curated-seed-queue.json` as the first 10-pair
SaaS/devtool seed queue, or copy it to `datasets/taste-capture-queue.json` and
edit before running.

Use `docs/examples/taste-curated-expansion-queue.json` as the second validated
20-pair SaaS/devtool expansion queue once the first seed has been captured and
labeled.

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

The report compares the mechanical baseline against the saved ranker on both
train and holdout records. The audit and report both require at least 10 real
non-synthetic held-out labels by default; synthetic-only reports are pipeline
smoke, not promotion evidence.

## Runtime

When a report is good enough for a product trial, set the Pages env var:

```text
TASTE_RANKER_MODEL_JSON=<contents of models/taste-linear-ranker.json>
```

The API uses this local ranker before trying the VLM or mechanical fallback.
