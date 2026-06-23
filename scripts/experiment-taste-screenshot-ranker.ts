#!/usr/bin/env bun
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';
import type { TastePairManifest } from '../src/lib/tasteDataset.ts';
import { type TasteJsonlRecord, tasteJsonlFeatureVector } from '../src/lib/tasteJsonl.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCREENSHOT_FEATURE_NAMES = [
  'desktop_brightness_delta',
  'desktop_contrast_delta',
  'desktop_saturation_delta',
  'desktop_dark_ratio_delta',
  'desktop_light_ratio_delta',
  'desktop_colorfulness_delta',
  'desktop_edge_density_delta',
  'mobile_brightness_delta',
  'mobile_contrast_delta',
  'mobile_saturation_delta',
  'mobile_dark_ratio_delta',
  'mobile_light_ratio_delta',
  'mobile_colorfulness_delta',
  'mobile_edge_density_delta',
] as const;

type Preference = 'a' | 'b' | 'tie' | 'unknown';

interface CliArgs {
  pairsDir: string;
  trainPath: string;
  testPath: string;
  outPath: string;
  includeEvidenceFeatures: boolean;
}

interface Example {
  id: string;
  x: number[];
  y: number;
  label: Exclude<Preference, 'tie' | 'unknown'>;
}

interface ImageStats {
  brightness: number;
  contrast: number;
  saturation: number;
  darkRatio: number;
  lightRatio: number;
  colorfulness: number;
  edgeDensity: number;
}

function parseArgs(argv: string[]): CliArgs {
  let pairsDir = 'captures/taste-pairs';
  let trainPath = 'datasets/taste-train.jsonl';
  let testPath = 'datasets/taste-holdout.jsonl';
  let outPath = 'reports/taste-screenshot-ranker-report.json';
  let includeEvidenceFeatures = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--pairs' && next) {
      pairsDir = next;
      i += 1;
    } else if (arg === '--train' && next) {
      trainPath = next;
      i += 1;
    } else if (arg === '--test' && next) {
      testPath = next;
      i += 1;
    } else if (arg === '--out' && next) {
      outPath = next;
      i += 1;
    } else if (arg === '--include-evidence-features') {
      includeEvidenceFeatures = true;
    }
  }

  return {
    pairsDir: path.resolve(ROOT, pairsDir),
    trainPath: path.resolve(ROOT, trainPath),
    testPath: path.resolve(ROOT, testPath),
    outPath: path.resolve(ROOT, outPath),
    includeEvidenceFeatures,
  };
}

async function findJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return findJsonFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith('.json')) return [fullPath];
      return [];
    })
  );
  return nested.flat().sort();
}

async function readJsonl(filePath: string): Promise<TasteJsonlRecord[]> {
  const text = await readFile(filePath, 'utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TasteJsonlRecord);
}

async function readPairMap(pairsDir: string) {
  const pairs = new Map<string, TastePairManifest>();
  for (const file of await findJsonFiles(pairsDir)) {
    const pair = JSON.parse(await readFile(file, 'utf8')) as TastePairManifest;
    if (pair.schemaVersion === 1 && pair.pairId) pairs.set(pair.pairId, pair);
  }
  return pairs;
}

async function imageStats(page: Page, imagePath: string): Promise<ImageStats> {
  await page.goto(pathToFileURL(imagePath).toString(), { waitUntil: 'load' });
  return page.evaluate(`(() => {
    const image = document.querySelector("img");
    if (!image) throw new Error("Image document did not contain an img element");
      const width = 160;
      const height = 120;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create canvas context");
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const luminance = [];
      const saturation = [];
      const rg = [];
      const yb = [];
      let dark = 0;
      let light = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const value = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        luminance.push(value);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        saturation.push(max === 0 ? 0 : (max - min) / max);
        rg.push((r - g) / 255);
        yb.push((0.5 * (r + g) - b) / 255);
        if (value < 0.18) dark += 1;
        if (value > 0.9) light += 1;
      }

      const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
      const std = (values) => {
        const average = mean(values);
        return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
      };
      const rgStd = std(rg);
      const ybStd = std(yb);
      const rgMean = mean(rg);
      const ybMean = mean(yb);

      let edgeTotal = 0;
      let edgeCount = 0;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const center = luminance[y * width + x];
          const right = luminance[y * width + x + 1];
          const down = luminance[(y + 1) * width + x];
          edgeTotal += Math.abs(center - right) + Math.abs(center - down);
          edgeCount += 2;
        }
      }

      return {
        brightness: mean(luminance),
        contrast: std(luminance),
        saturation: mean(saturation),
        darkRatio: dark / luminance.length,
        lightRatio: light / luminance.length,
        colorfulness: Math.sqrt(rgStd ** 2 + ybStd ** 2) + 0.3 * Math.sqrt(rgMean ** 2 + ybMean ** 2),
        edgeDensity: edgeTotal / Math.max(1, edgeCount),
      };
  })()`) as Promise<ImageStats>;
}

async function screenshotStatsForVariant(
  page: Page,
  pair: TastePairManifest,
  variantIndex: number
) {
  const variant = pair.variants[variantIndex]!;
  const captureDir = path.dirname(path.resolve(ROOT, variant.captureManifestPath));
  const byViewport = Object.fromEntries(
    variant.artifacts.map((artifact) => [artifact.viewport, artifact])
  );
  const stats: ImageStats[] = [];

  for (const viewport of ['desktop', 'mobile'] as const) {
    const artifact = byViewport[viewport];
    if (!artifact) throw new Error(`${pair.pairId} ${variant.id} is missing ${viewport} artifact`);
    stats.push(await imageStats(page, path.join(captureDir, artifact.aboveFoldPath)));
  }

  return stats.flatMap((stat) => [
    stat.brightness,
    stat.contrast,
    stat.saturation,
    stat.darkRatio,
    stat.lightRatio,
    stat.colorfulness,
    stat.edgeDensity,
  ]);
}

async function screenshotFeatureVector(page: Page, pair: TastePairManifest) {
  const a = await screenshotStatsForVariant(page, pair, 0);
  const b = await screenshotStatsForVariant(page, pair, 1);
  return a.map((value, index) => (b[index] ?? 0) - value);
}

function target(label: Preference): number | null {
  if (label === 'a') return 1;
  if (label === 'b') return 0;
  return null;
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
}

function dot(weights: number[], x: number[]) {
  return weights.reduce((sum, weight, index) => sum + weight * (x[index] ?? 0), 0);
}

function standardize(train: Example[], test: Example[]) {
  const featureCount = train[0]?.x.length ?? 0;
  const means = Array.from(
    { length: featureCount },
    (_, index) => train.reduce((sum, example) => sum + example.x[index]!, 0) / train.length
  );
  const scales = means.map((mean, index) => {
    const variance =
      train.reduce((sum, example) => sum + (example.x[index]! - mean) ** 2, 0) / train.length;
    return Math.sqrt(variance) || 1;
  });
  const apply = (examples: Example[]) =>
    examples.map((example) => ({
      ...example,
      x: example.x.map((value, index) => (value - means[index]!) / scales[index]!),
    }));
  return { train: apply(train), test: apply(test), means, scales };
}

function trainModel(examples: Example[], params: { epochs: number; lr: number; l2: number }) {
  const weights = Array.from({ length: examples[0]!.x.length }, () => 0);
  let bias = 0;

  for (let epoch = 0; epoch < params.epochs; epoch++) {
    for (const example of examples) {
      const pred = sigmoid(dot(weights, example.x) + bias);
      const error = pred - example.y;
      for (let i = 0; i < weights.length; i++) {
        weights[i] -= params.lr * (error * example.x[i]! + params.l2 * weights[i]!);
      }
      bias -= params.lr * error;
    }
  }

  return { weights, bias, ...params };
}

function evaluate(examples: Example[], model: ReturnType<typeof trainModel>, threshold: number) {
  const rows = examples.map((example) => {
    const probA = sigmoid(dot(model.weights, example.x) + model.bias);
    const predicted = probA >= threshold ? 'a' : 'b';
    return {
      id: example.id,
      predicted,
      actual: example.label,
      probA,
    };
  });
  const correct = rows.filter((row) => row.predicted === row.actual).length;
  return {
    records: examples.length,
    correct,
    accuracy: examples.length ? correct / examples.length : 0,
    misses: rows.filter((row) => row.predicted !== row.actual),
  };
}

function chooseModel(train: Example[]) {
  const candidates = [];
  for (const lr of [0.01, 0.03, 0.08, 0.15]) {
    for (const l2 of [0.001, 0.01, 0.05, 0.1, 0.2]) {
      const model = trainModel(train, { epochs: 1200, lr, l2 });
      for (const threshold of [0.4, 0.45, 0.5, 0.55, 0.6]) {
        const trainEval = evaluate(train, model, threshold);
        candidates.push({ model, threshold, trainEval });
      }
    }
  }
  return candidates.sort(
    (a, b) =>
      b.trainEval.accuracy - a.trainEval.accuracy ||
      a.model.l2 - b.model.l2 ||
      a.model.lr - b.model.lr ||
      a.threshold - b.threshold
  )[0]!;
}

async function buildExamples(params: {
  page: Page;
  records: TasteJsonlRecord[];
  pairs: Map<string, TastePairManifest>;
  includeEvidenceFeatures: boolean;
}) {
  const examples: Example[] = [];
  const cache = new Map<string, number[]>();

  for (const record of params.records) {
    const label = record.label?.preferredVariantId ?? 'unknown';
    const y = target(label);
    if (y == null || (label !== 'a' && label !== 'b')) continue;
    const pair = params.pairs.get(record.id);
    if (!pair) throw new Error(`Missing pair manifest for ${record.id}`);
    let imageFeatures = cache.get(record.id);
    if (!imageFeatures) {
      imageFeatures = await screenshotFeatureVector(params.page, pair);
      cache.set(record.id, imageFeatures);
    }
    const evidenceFeatures = params.includeEvidenceFeatures
      ? (tasteJsonlFeatureVector(record) ?? [])
      : [];
    examples.push({ id: record.id, x: [...evidenceFeatures, ...imageFeatures], y, label });
  }

  return examples;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [pairs, trainRecords, testRecords] = await Promise.all([
    readPairMap(args.pairsDir),
    readJsonl(args.trainPath),
    readJsonl(args.testPath),
  ]);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    const rawTrain = await buildExamples({
      page,
      records: trainRecords,
      pairs,
      includeEvidenceFeatures: args.includeEvidenceFeatures,
    });
    const rawTest = await buildExamples({
      page,
      records: testRecords,
      pairs,
      includeEvidenceFeatures: args.includeEvidenceFeatures,
    });
    if (!rawTrain.length || !rawTest.length) throw new Error('Need train and test examples');
    const scaled = standardize(rawTrain, rawTest);
    const selected = chooseModel(scaled.train);
    const holdoutEval = evaluate(scaled.test, selected.model, selected.threshold);
    const featureNames = [
      ...(args.includeEvidenceFeatures
        ? (tasteJsonlFeatureVector(trainRecords[0]!)?.map((_, index) => `evidence_${index}`) ?? [])
        : []),
      ...SCREENSHOT_FEATURE_NAMES,
    ];
    const report = {
      generatedAt: new Date().toISOString(),
      modelId: args.includeEvidenceFeatures
        ? 'taste-screenshot-plus-evidence-ranker-v0'
        : 'taste-screenshot-stats-ranker-v0',
      inputs: {
        pairs: path.relative(ROOT, args.pairsDir),
        train: path.relative(ROOT, args.trainPath),
        test: path.relative(ROOT, args.testPath),
        includeEvidenceFeatures: args.includeEvidenceFeatures,
      },
      featureNames,
      selected: {
        lr: selected.model.lr,
        l2: selected.model.l2,
        epochs: selected.model.epochs,
        threshold: selected.threshold,
      },
      metrics: {
        train: selected.trainEval,
        holdout: holdoutEval,
      },
      recommendation:
        holdoutEval.accuracy >= 0.7
          ? 'Screenshot-stat ranker clears the promotion accuracy bar; compare against the main report before promotion.'
          : `Screenshot-stat ranker is not promotion-ready: holdout accuracy ${holdoutEval.accuracy.toFixed(3)} is below 0.700.`,
    };

    await mkdir(path.dirname(args.outPath), { recursive: true });
    await writeFile(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      JSON.stringify(
        {
          report: path.relative(ROOT, args.outPath),
          modelId: report.modelId,
          trainAccuracy: report.metrics.train.accuracy,
          holdoutAccuracy: report.metrics.holdout.accuracy,
          selected: report.selected,
          recommendation: report.recommendation,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
