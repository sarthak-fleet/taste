export type CaptureViewportName = 'desktop' | 'mobile';

export interface CaptureViewport {
  name: CaptureViewportName;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile?: boolean;
}

export interface CaptureIssue {
  selector: string;
  text?: string;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  detail: string;
}

export interface MechanicalMetrics {
  url: string;
  finalUrl: string;
  viewport: CaptureViewport;
  title: string;
  capturedAt: string;
  loadMs: number;
  page: {
    viewportWidth: number;
    viewportHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    overflowX: number;
    aboveFoldTextChars: number;
    aboveFoldTextDensity: number;
    firstSectionHeightRatio: number | null;
    visibleHeadingCount: number;
    visibleActionCount: number;
    failedImageCount: number;
  };
  issues: {
    horizontalOverflow: CaptureIssue[];
    clippedText: CaptureIssue[];
    lowContrastText: CaptureIssue[];
    tinyText: CaptureIssue[];
    failedImages: CaptureIssue[];
  };
  risk: {
    score: number;
    level: 'low' | 'medium' | 'high';
    reasons: string[];
  };
}

export interface CaptureArtifact {
  viewport: CaptureViewportName;
  aboveFoldPath: string;
  fullPagePath: string;
  metrics: MechanicalMetrics;
}

export interface TasteCaptureManifest {
  schemaVersion: 1;
  source: {
    url: string;
    label?: string;
    notes?: string;
  };
  capturedAt: string;
  artifacts: CaptureArtifact[];
}

export const TASTE_CAPTURE_VIEWPORTS: CaptureViewport[] = [
  { name: 'desktop', width: 1440, height: 1100, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 1100, deviceScaleFactor: 1, isMobile: true },
];

export function summarizeMechanicalRisk(
  metrics: Omit<MechanicalMetrics, 'risk'>
): MechanicalMetrics['risk'] {
  const reasons: string[] = [];
  let score = 0;

  if (metrics.page.overflowX > 2) {
    score += 25;
    reasons.push(`horizontal overflow ${Math.round(metrics.page.overflowX)}px`);
  }

  if (metrics.issues.clippedText.length > 0) {
    score += Math.min(25, metrics.issues.clippedText.length * 5);
    reasons.push(`${metrics.issues.clippedText.length} clipped text candidates`);
  }

  if (metrics.issues.lowContrastText.length > 0) {
    score += Math.min(20, metrics.issues.lowContrastText.length * 3);
    reasons.push(`${metrics.issues.lowContrastText.length} low contrast candidates`);
  }

  if (metrics.issues.tinyText.length > 0) {
    score += Math.min(10, metrics.issues.tinyText.length * 2);
    reasons.push(`${metrics.issues.tinyText.length} tiny text candidates`);
  }

  if (metrics.page.firstSectionHeightRatio != null && metrics.page.firstSectionHeightRatio > 1.25) {
    score += 10;
    reasons.push(
      `first section is ${metrics.page.firstSectionHeightRatio.toFixed(1)}x viewport height`
    );
  }

  if (metrics.page.visibleActionCount === 0) {
    score += 10;
    reasons.push('no visible above-fold action');
  }

  if (metrics.page.failedImageCount > 0) {
    score += Math.min(10, metrics.page.failedImageCount * 5);
    reasons.push(`${metrics.page.failedImageCount} failed images`);
  }

  const bounded = Math.min(100, Math.round(score));
  const level = bounded >= 45 ? 'high' : bounded >= 20 ? 'medium' : 'low';

  return {
    score: bounded,
    level,
    reasons,
  };
}
