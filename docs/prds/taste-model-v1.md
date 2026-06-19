# PRD - Taste Model v1

## Summary

Ship the first real model behind ShipRank/Taste: a visual preference model that
judges product and website variants across design-quality criteria, then feeds
the existing agent/report pipeline.

The product should not depend on generic VLM taste. The model should learn a
specific job:

> Given product context, audience, objective, and screenshots of 2-5 variants,
> choose which variant has better taste for the job and explain the criterion
> signals.

This is a supervised pairwise preference model first. Reinforcement learning is
deferred until the reward model is stable enough to guide an editing agent.

## Current status - 2026-06-19

The first real-label path is wired end to end:

- curated SaaS/devtool seed queue exists in
  `docs/examples/taste-curated-seed-queue.json`
- Playwright capture can generate desktop/mobile above-fold and full-page
  screenshots plus mechanical metrics
- pair manifests can be reviewed, labeled, audited, exported to JSONL, split,
  trained, and reported
- first curated seed smoke: 10 real labeled pairs, 7 train / 3 holdout,
  `taste-linear-mechanical-ranker-v0` report generated locally with holdout
  readiness passing
- second curated expansion queue: 20 additional SaaS/devtool pairs with 40
  live URLs validated, captured locally, and labeled locally
- current local report over 70 real curated labels: 20 train / 50 holdout
  promotion-gate split, `taste-linear-evidence-ranker-v0` comparison-ready but
  not promotion-ready (`0.58` holdout accuracy vs `0.34` mechanical baseline;
  promotion gate defaults require 50 real heldout labels, 0.70 accuracy, and
  +0.05 over baseline)

This is a pipeline proof, not model-quality proof. The next real milestone is
label volume: expand from 70 curated pairs to 100-300 category-balanced real pairs,
then train a screenshot-aware model and report category-balanced held-out
accuracy against the mechanical baseline before promoting a model behind
`TASTE_RANKER_MODEL_JSON`.

## Why now

ShipRank already has the product shell:

- study creation for 2-5 variants
- mock evaluator agents
- pairwise verdicts by criterion
- signal-quality reporting
- consensus/disagreement logic
- decision reports

The missing moat is the model. Current mock agents produce shaped data but no
real visual judgment. A Taste model turns the product from a workflow demo into
real product judgment infrastructure.

The TASTE paper validates the approach:

- design preference should be multi-dimensional, not one scalar score
- pairwise/ranking labels are more reliable than raw 1-10 labels
- off-the-shelf VLM judges and generic T2I scorers underperform designer panels
- a small trained head can close much of the gap to human-rater agreement

Reference:

- Paper: https://arxiv.org/abs/2605.20731v2
- Dataset: https://huggingface.co/datasets/purvanshi/TASTE

## Goals

1. Replace the highest-value mock evaluator path with a real visual preference
   model.
2. Score variants across criteria that map to product decisions, not generic
   image beauty.
3. Preserve the existing report contract so the product can improve without a
   full app rewrite.
4. Build a data flywheel: every captured variant, model judgment, user edit,
   and eventual outcome can improve the model.
5. Run the first trainable version cheaply on local Mac hardware.

## Non-goals

- Do not train a frontier VLM from scratch.
- Do not start with RL.
- Do not claim objective beauty or universal taste.
- Do not judge consumer shopping, fashion, art, or general photography in v1.
- Do not replace Lighthouse/axe/mechanical checks; they are separate hard
  signals.
- Do not require production human evaluators before the agent-first model works.

## Product surface

Taste Model v1 powers these flows:

1. Study launch
   - User submits 2-5 landing/onboarding/pricing/copy/UX variants.
   - System captures screenshots and mechanical metrics.
   - Taste model emits pairwise criterion judgments.
   - Existing report pipeline ranks variants and writes the decision report.

2. Product Arena
   - Public battles can show "Taste model pick" after a user vote.
   - Arena outcomes later become weak calibration data.

3. Internal calibration
   - Admin view compares model pick vs submitted outcome.
   - Repeated misses downgrade future model confidence for similar study types.

## Inputs

Per study:

- productName
- studyType
- targetUserRole
- primaryObjective
- optional brand/context notes

Per variant:

- URL or uploaded screenshot
- variantLabel
- variantName
- optional user-provided description
- desktop screenshot, above fold
- desktop screenshot, full page
- mobile screenshot, above fold
- mobile screenshot, full page
- mechanical metrics:
  - Lighthouse scores where available
  - axe/accessibility violations
  - contrast warnings
  - horizontal overflow
  - clipped text
  - overlapping visible elements
  - viewport density and hero height ratios

## Output contract

The model should emit data compatible with the current `AgentOutput` and
`PairwiseVerdict` concepts.

```ts
type TasteCriterion =
  | "typography"
  | "layoutHierarchy"
  | "spacing"
  | "colorHarmony"
  | "visualPolish"
  | "brandTone"
  | "readability"
  | "mobileFit"
  | "conversionClarity"
  | "trustSignals";

interface TastePairwiseVerdict {
  criterion: TasteCriterion;
  variantAId: string;
  variantBId: string;
  preferredVariantId: string | null;
  confidence: number;
  rationale: string;
  evidence: string[];
  validityFlags: Array<{
    level: "minor" | "major";
    type:
      | "missing_screenshot"
      | "render_failure"
      | "unjudgeable_context"
      | "low_visual_difference"
      | "mechanical_failure";
    description: string;
  }>;
}

interface TasteModelResult {
  studyId: string;
  modelId: string;
  overallWinnerVariantId: string | null;
  overallConfidence: number;
  pairwiseVerdicts: TastePairwiseVerdict[];
  criterionScoresByVariant: Record<string, Partial<Record<TasteCriterion, number>>>;
  summary: string;
}
```

## Criteria

V1 criteria should map the TASTE-paper idea to web/product surfaces:

| Criterion | Meaning |
| --- | --- |
| typography | Type scale, font pairing, line length, rhythm, hierarchy |
| layoutHierarchy | Whether attention flows to the right product/action |
| spacing | Density, whitespace, alignment, component breathing room |
| colorHarmony | Palette quality, contrast, accent discipline |
| visualPolish | Detail, finish, non-generic feel, production readiness |
| brandTone | Whether the style fits the product category and audience |
| readability | Scannability, copy legibility, text collision avoidance |
| mobileFit | Whether mobile preserves hierarchy and usable controls |
| conversionClarity | CTA visibility, next-step clarity, product promise clarity |
| trustSignals | Proof, credibility, and reduction of buyer skepticism |

Existing `DimensionScores` can remain for reports, but the pipeline should add a
mapping layer from Taste criteria to product dimensions.

Example mapping:

- `clarity`: layoutHierarchy + readability + conversionClarity
- `trust`: trustSignals + visualPolish
- `firstActionClarity`: conversionClarity + mobileFit
- `perceivedValue`: brandTone + visualPolish + layoutHierarchy
- `friction`: mobileFit + readability + mechanical failures
- `differentiation`: brandTone + visualPolish

## Data plan

Use three tiers of data.

### Tier 1 - Existing public datasets

Use as warm-start / representation data, not as final website taste truth.

- `purvanshi/TASTE`
  - designer-annotated multi-dimensional preference data for generated graphic
    design
  - useful for criteria-aware design preference
- `HuggingFaceM4/WebSight`
  - synthetic website screenshots + HTML/CSS
  - useful for screenshot-layout-code grounding
- `Voxel51/rico` and RICO variants
  - mobile UI screenshots and semantics
  - useful for mobile UI/layout grounding
- AVA / LAION aesthetics
  - optional broad visual aesthetic pretraining
  - lower priority because photo aesthetics are not product/web design

### Tier 2 - Web-TASTE captured dataset

Build our own dataset with Playwright:

- positives:
  - curated website galleries such as Awwwards, Land-book, Godly, Siteinspire
  - high-quality SaaS/devtool/product pages selected by hand
- negatives:
  - old templates
  - random low-quality websites
  - generated weak pages
  - synthetic degradations of good pages
- pairs:
  - before/after redesigns
  - good page vs degraded page
  - same category pairings
  - same page desktop vs mobile failure cases

Synthetic degradations:

- inflate hero type
- reduce contrast
- compress spacing
- misalign grid columns
- remove visual hierarchy
- overuse one accent color
- break mobile stacking
- hide or weaken CTA
- introduce text clipping/overflow

### Tier 3 - Product feedback loop

From live Taste usage:

- user-chosen winner
- user overrides of model pick
- comments on why the model was wrong
- eventual submitted outcome
- Arena vote distribution
- post-model edits that users accept

These become calibration and fine-tuning data after consent/privacy rules are
defined.

## Training approach

V1 should be a supervised ranker.

Baseline:

1. Encode screenshots with a frozen visual encoder.
2. Concatenate:
   - desktop embedding
   - mobile embedding
   - context text embedding
   - mechanical metric vector
   - criterion embedding
3. Train a small MLP head to predict pairwise preference.
4. Calibrate confidence on held-out pairs.

Candidate encoders:

- SigLIP / CLIP style encoder for screenshot embeddings
- DINO-style encoder for visual layout features
- optional OCR/layout feature extractor later

Loss:

- pairwise preference cross-entropy
- optional criterion-specific heads
- optional auxiliary score regression only when labels are reliable

Do not train RL in v1. RL only becomes useful when a website-editing agent uses
the Taste model as a reward.

## Evaluation

Offline gates:

- pairwise accuracy against held-out designer/user labels
- per-criterion majority agreement
- Kendall tau against panel rankings
- calibration error by confidence bucket
- category holdout: SaaS, devtool, pricing, onboarding, mobile
- failure analysis on near-tie pairs

Product gates:

- model picks same winner as known outcome more often than mock baseline
- no major validity flag when screenshots render cleanly
- explanations cite visible evidence, not vague design language
- confidence drops on low-difference or unjudgeable pairs

Mechanical gates remain separate:

- Lighthouse / axe / contrast checks do not get hidden inside model score
- model cannot override hard mechanical failure without mentioning it

## Integration plan

### Phase 0 - Contract and capture

- Add screenshot capture service for study variants.
- Store screenshot metadata and mechanical metrics.
- Add a `visual_evaluations` or equivalent storage record.
- Keep current mock agents as fallback.

### Phase 1 - Heuristic + VLM judge

- Implement a real evaluator service that combines:
  - mechanical metrics
  - screenshots
  - strict rubric prompt to an external VLM
- Emit the same `AgentOutput` / `PairwiseVerdict` shape.
- Use this to collect labeled examples and validate the report contract.

### Phase 2 - Local supervised ranker

- Train frozen-encoder + MLP ranker on TASTE + Web-TASTE.
- Serve as a local or small API model.
- Compare against VLM judge and mock baseline.

### Phase 3 - Taste model in product

- Route landing/onboarding/pricing studies through the model.
- Add model version to report output.
- Add confidence and validity flags to UI.
- Add admin calibration review.

### Phase 4 - Editing agent reward

- Use model as reward for an agent that proposes CSS/layout fixes.
- Still gate final output with screenshots and deterministic checks.
- Consider RL only here.

## Privacy and legal notes

- Respect robots.txt and site terms for curated gallery crawling.
- Store source URL, capture date, and license/usage notes for every example.
- For customer variants, default to private storage and no training reuse unless
  the user opts in.
- Do not use customer screenshots as public benchmark examples without explicit
  permission.

## Acceptance criteria

V1 is done when:

- A study can run a real visual evaluator instead of mock-only agents.
- The evaluator emits pairwise criterion verdicts for 2-5 variants.
- The report displays model-derived strengths, weaknesses, confidence, and
  validity flags.
- The system stores enough data to rebuild the training/eval set.
- Held-out pairwise accuracy beats a simple Lighthouse-only baseline.
- The model can identify obvious issues like oversized hero, broken mobile
  stacking, weak CTA hierarchy, low contrast, and generic visual polish.

## Open questions

- Which visual encoder gives the best Mac-local tradeoff for screenshots?
- Do we need OCR/layout tokens in v1, or are screenshot embeddings plus
  mechanical metrics enough?
- How much curated-gallery scraping is allowed by each source's terms?
- Should `taste` own the model server, or should TinyGPT own the training/export
  path and `taste` call it?
- What is the first narrow category: SaaS landing pages, devtool landing pages,
  or onboarding flows?
