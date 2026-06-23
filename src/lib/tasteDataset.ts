import type { CaptureArtifact } from './visualEvidence';

export const TASTE_CRITERIA = [
  'typography',
  'layoutHierarchy',
  'spacing',
  'colorHarmony',
  'visualPolish',
  'brandTone',
  'readability',
  'mobileFit',
  'conversionClarity',
  'trustSignals',
] as const;

export type TasteCriterion = (typeof TASTE_CRITERIA)[number];
export type TastePairVariantId = 'a' | 'b';
export type TastePairPreference = TastePairVariantId | 'tie' | 'unknown';

export interface TastePairContext {
  productName?: string;
  studyType?: string;
  targetUserRole?: string;
  primaryObjective?: string;
  notes?: string;
}

export interface TastePairVariant {
  id: TastePairVariantId;
  label: string;
  url: string;
  captureManifestPath: string;
  capturedAt: string;
  artifacts: CaptureArtifact[];
  mechanicalSummary: {
    highestRiskLevel: 'low' | 'medium' | 'high';
    highestRiskScore: number;
    totalClippedTextCandidates: number;
    totalLowContrastCandidates: number;
    totalFailedImages: number;
    maxHorizontalOverflow: number;
  };
}

export interface TastePairLabel {
  preferredVariantId: TastePairPreference;
  confidence?: number;
  rationale?: string;
  criterionPreferences?: Partial<Record<TasteCriterion, TastePairPreference>>;
  annotator?: string;
  labeledAt: string;
}

export interface TastePairManifest {
  schemaVersion: 1;
  pairId: string;
  createdAt: string;
  source: {
    kind: 'manual' | 'curated_gallery' | 'synthetic_degradation' | 'product_feedback';
    notes?: string;
  };
  context: TastePairContext;
  variants: [TastePairVariant, TastePairVariant];
  label?: TastePairLabel;
}

export function summarizeCaptureArtifactRisk(
  artifacts: CaptureArtifact[]
): TastePairVariant['mechanicalSummary'] {
  let highestRiskScore = 0;
  let highestRiskLevel: 'low' | 'medium' | 'high' = 'low';
  let totalClippedTextCandidates = 0;
  let totalLowContrastCandidates = 0;
  let totalFailedImages = 0;
  let maxHorizontalOverflow = 0;

  for (const artifact of artifacts) {
    const { metrics } = artifact;
    highestRiskScore = Math.max(highestRiskScore, metrics.risk.score);
    totalClippedTextCandidates += metrics.issues.clippedText.length;
    totalLowContrastCandidates += metrics.issues.lowContrastText.length;
    totalFailedImages += metrics.page.failedImageCount;
    maxHorizontalOverflow = Math.max(maxHorizontalOverflow, metrics.page.overflowX);
  }

  if (highestRiskScore >= 45) {
    highestRiskLevel = 'high';
  } else if (highestRiskScore >= 20) {
    highestRiskLevel = 'medium';
  }

  return {
    highestRiskLevel,
    highestRiskScore,
    totalClippedTextCandidates,
    totalLowContrastCandidates,
    totalFailedImages,
    maxHorizontalOverflow,
  };
}
