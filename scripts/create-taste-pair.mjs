#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRITERIA = new Set([
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
]);
const PREFERENCES = new Set(['a', 'b', 'tie', 'unknown']);
const SOURCE_KINDS = new Set([
  'manual',
  'curated_gallery',
  'synthetic_degradation',
  'product_feedback',
]);

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
    } else {
      args.set(key, next);
      i += 1;
    }
  }
  return args;
}

function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'taste-pair'
  );
}

function resolvePath(value) {
  return path.resolve(ROOT, value);
}

function relativeToRoot(value) {
  return path.relative(ROOT, value);
}

async function readCaptureManifest(filePath) {
  const raw = JSON.parse(await readFile(filePath, 'utf8'));
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.artifacts) || !raw.source?.url) {
    throw new Error(`${filePath} is not a Taste capture manifest`);
  }
  return raw;
}

function summarizeMechanicalRisk(artifacts) {
  let highestRiskScore = 0;
  let totalClippedTextCandidates = 0;
  let totalLowContrastCandidates = 0;
  let totalFailedImages = 0;
  let maxHorizontalOverflow = 0;

  for (const artifact of artifacts) {
    const metrics = artifact.metrics;
    highestRiskScore = Math.max(highestRiskScore, metrics.risk.score);
    totalClippedTextCandidates += metrics.issues.clippedText.length;
    totalLowContrastCandidates += metrics.issues.lowContrastText.length;
    totalFailedImages += metrics.page.failedImageCount;
    maxHorizontalOverflow = Math.max(maxHorizontalOverflow, metrics.page.overflowX);
  }

  return {
    highestRiskLevel: highestRiskScore >= 45 ? 'high' : highestRiskScore >= 20 ? 'medium' : 'low',
    highestRiskScore,
    totalClippedTextCandidates,
    totalLowContrastCandidates,
    totalFailedImages,
    maxHorizontalOverflow,
  };
}

function parseCriterionPreferences(value) {
  if (!value) return undefined;
  const preferences = {};
  for (const entry of value.split(',')) {
    const [criterion, preference] = entry.split(':').map((part) => part?.trim());
    if (!CRITERIA.has(criterion)) {
      throw new Error(`Unknown criterion "${criterion}"`);
    }
    if (!PREFERENCES.has(preference)) {
      throw new Error(`Criterion "${criterion}" has invalid preference "${preference}"`);
    }
    preferences[criterion] = preference;
  }
  return preferences;
}

function buildVariant({ id, manifest, manifestPath, fallbackLabel }) {
  return {
    id,
    label: manifest.source.label || fallbackLabel,
    url: manifest.source.url,
    captureManifestPath: relativeToRoot(manifestPath),
    capturedAt: manifest.capturedAt,
    artifacts: manifest.artifacts,
    mechanicalSummary: summarizeMechanicalRisk(manifest.artifacts),
  };
}

function buildLabel(args, createdAt) {
  const preferredVariantId = args.get('preferred');
  if (!preferredVariantId) return undefined;
  if (!PREFERENCES.has(preferredVariantId)) {
    throw new Error('--preferred must be one of: a, b, tie, unknown');
  }

  const confidence = args.has('confidence') ? Number.parseFloat(args.get('confidence')) : undefined;
  if (
    confidence !== undefined &&
    (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
  ) {
    throw new Error('--confidence must be a number from 0 to 1');
  }

  return {
    preferredVariantId,
    confidence,
    rationale: args.get('rationale'),
    criterionPreferences: parseCriterionPreferences(args.get('criteria')),
    annotator: args.get('annotator'),
    labeledAt: createdAt,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const aPathArg = args.get('a');
  const bPathArg = args.get('b');
  if (!aPathArg || !bPathArg) {
    console.error(
      'Usage: bun pair:taste -- --a captures/a/manifest.json --b captures/b/manifest.json [--preferred a|b|tie|unknown]'
    );
    process.exit(2);
  }

  const aPath = resolvePath(aPathArg);
  const bPath = resolvePath(bPathArg);
  const [aManifest, bManifest] = await Promise.all([
    readCaptureManifest(aPath),
    readCaptureManifest(bPath),
  ]);
  const createdAt = new Date().toISOString();
  const label =
    args.get('label') || `${aManifest.source.label || 'a'}-vs-${bManifest.source.label || 'b'}`;
  const sourceKind = args.get('source-kind') || 'manual';
  if (!SOURCE_KINDS.has(sourceKind)) {
    throw new Error(
      '--source-kind must be one of: manual, curated_gallery, synthetic_degradation, product_feedback'
    );
  }

  const pair = {
    schemaVersion: 1,
    pairId: `${slugify(label)}-${createdAt.replace(/[:.]/g, '-')}`,
    createdAt,
    source: {
      kind: sourceKind,
      notes: args.get('source-notes'),
    },
    context: {
      productName: args.get('product-name'),
      studyType: args.get('study-type'),
      targetUserRole: args.get('target-user'),
      primaryObjective: args.get('objective'),
      notes: args.get('context-notes'),
    },
    variants: [
      buildVariant({
        id: 'a',
        manifest: aManifest,
        manifestPath: aPath,
        fallbackLabel: 'Variant A',
      }),
      buildVariant({
        id: 'b',
        manifest: bManifest,
        manifestPath: bPath,
        fallbackLabel: 'Variant B',
      }),
    ],
    label: buildLabel(args, createdAt),
  };

  const outBase = resolvePath(args.get('out') || 'captures/taste-pairs');
  await mkdir(outBase, { recursive: true });
  const outPath = path.join(outBase, `${pair.pairId}.json`);
  await writeFile(outPath, `${JSON.stringify(pair, null, 2)}\n`);

  const status = pair.label ? `label=${pair.label.preferredVariantId}` : 'unlabeled';
  console.log(`Created Taste pair ${pair.pairId}`);
  console.log(`Output: ${relativeToRoot(outPath)}`);
  console.log(
    `Variants: a=${pair.variants[0].mechanicalSummary.highestRiskLevel}/${pair.variants[0].mechanicalSummary.highestRiskScore}, b=${pair.variants[1].mechanicalSummary.highestRiskLevel}/${pair.variants[1].mechanicalSummary.highestRiskScore}`
  );
  console.log(`Status: ${status}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
