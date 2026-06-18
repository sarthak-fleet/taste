#!/usr/bin/env tsx
import { runTasteLinearRankerForVariants, type TasteLinearRankerModel } from "../src/lib/tasteRanker.ts";
import type { TasteBaselineVariant } from "../src/lib/tasteBaseline.ts";

function variant(id: string, highestRiskScore: number): TasteBaselineVariant {
  return {
    id,
    label: id.toUpperCase(),
    artifacts: [],
    mechanicalSummary: {
      highestRiskScore,
      totalClippedTextCandidates: 0,
      totalLowContrastCandidates: 0,
      totalFailedImages: 0,
      maxHorizontalOverflow: 0,
    },
  };
}

const model: TasteLinearRankerModel = {
  modelId: "taste-linear-mechanical-ranker-smoke",
  featureNames: [
    "risk_delta",
    "clipped_delta",
    "contrast_delta",
    "failed_images_delta",
    "overflow_delta",
  ],
  weights: [4, 0, 0, 0, 0],
  bias: 0,
};

const result = runTasteLinearRankerForVariants({
  studyId: "smoke",
  studyType: "landing_page",
  variants: [variant("a", 0), variant("b", 80)],
  model,
});

if (result.modelId !== model.modelId) {
  throw new Error(`Expected modelId ${model.modelId}, got ${result.modelId}`);
}
if (result.overallWinnerVariantId !== "a") {
  throw new Error(`Expected ranker to prefer a, got ${result.overallWinnerVariantId ?? "tie"}`);
}
if (!result.pairwiseVerdicts.length || result.pairwiseVerdicts.some((verdict) => verdict.agentSlug !== model.modelId)) {
  throw new Error("Expected ranker pairwise verdicts to use the configured model id");
}

console.log(JSON.stringify({
  modelId: result.modelId,
  winner: result.overallWinnerVariantId,
  confidence: result.overallConfidence,
  verdicts: result.pairwiseVerdicts.length,
}, null, 2));
