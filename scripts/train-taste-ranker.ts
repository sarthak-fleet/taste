#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEATURE_NAMES = [
  "risk_delta",
  "clipped_delta",
  "contrast_delta",
  "failed_images_delta",
  "overflow_delta",
] as const;

type Preference = "a" | "b" | "tie" | "unknown";

interface TasteJsonlRecord {
  id: string;
  variants: Array<{
    id: string;
    mechanicalSummary: {
      highestRiskScore: number;
      totalClippedTextCandidates: number;
      totalLowContrastCandidates: number;
      totalFailedImages: number;
      maxHorizontalOverflow: number;
    };
  }>;
  label: {
    preferredVariantId: Preference;
  } | null;
}

interface TrainExample {
  id: string;
  x: number[];
  y: number;
  label: Preference;
}

interface CliArgs {
  inputPath: string;
  outPath: string;
  epochs: number;
  lr: number;
  l2: number;
}

function parseArgs(argv: string[]): CliArgs {
  let inputPath = "datasets/taste-pairs.jsonl";
  let outPath = "models/taste-linear-ranker.json";
  let epochs = 400;
  let lr = 0.08;
  let l2 = 0.001;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--in" && next) {
      inputPath = next;
      i += 1;
    } else if (arg === "--out" && next) {
      outPath = next;
      i += 1;
    } else if (arg === "--epochs" && next) {
      epochs = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--lr" && next) {
      lr = Number.parseFloat(next);
      i += 1;
    } else if (arg === "--l2" && next) {
      l2 = Number.parseFloat(next);
      i += 1;
    }
  }

  return {
    inputPath: path.resolve(ROOT, inputPath),
    outPath: path.resolve(ROOT, outPath),
    epochs: Number.isFinite(epochs) ? epochs : 400,
    lr: Number.isFinite(lr) ? lr : 0.08,
    l2: Number.isFinite(l2) ? l2 : 0.001,
  };
}

function features(record: TasteJsonlRecord): number[] | null {
  const [a, b] = record.variants;
  if (!a || !b) return null;
  const av = a.mechanicalSummary;
  const bv = b.mechanicalSummary;
  return [
    (bv.highestRiskScore - av.highestRiskScore) / 100,
    (bv.totalClippedTextCandidates - av.totalClippedTextCandidates) / 20,
    (bv.totalLowContrastCandidates - av.totalLowContrastCandidates) / 20,
    (bv.totalFailedImages - av.totalFailedImages) / 10,
    (bv.maxHorizontalOverflow - av.maxHorizontalOverflow) / 500,
  ];
}

function target(label: Preference): number | null {
  if (label === "a") return 1;
  if (label === "b") return 0;
  if (label === "tie") return 0.5;
  return null;
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function dot(weights: number[], x: number[]) {
  return weights.reduce((sum, weight, index) => sum + weight * (x[index] ?? 0), 0);
}

function predictPreference(probA: number): Preference {
  if (probA > 0.55) return "a";
  if (probA < 0.45) return "b";
  return "tie";
}

function accuracy(examples: TrainExample[], weights: number[], bias: number) {
  if (!examples.length) return 0;
  let correct = 0;
  for (const example of examples) {
    const predicted = predictPreference(sigmoid(dot(weights, example.x) + bias));
    if (predicted === example.label) correct++;
  }
  return correct / examples.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lines = (await readFile(args.inputPath, "utf8")).split("\n").filter(Boolean);
  const records = lines.map((line) => JSON.parse(line) as TasteJsonlRecord);
  const examples = records.flatMap((record): TrainExample[] => {
    const label = record.label?.preferredVariantId ?? "unknown";
    const y = target(label);
    const x = features(record);
    if (y == null || !x) return [];
    return [{ id: record.id, x, y, label }];
  });

  if (!examples.length) throw new Error("No labeled examples available for training");

  const weights = Array.from({ length: FEATURE_NAMES.length }, () => 0);
  let bias = 0;

  for (let epoch = 0; epoch < args.epochs; epoch++) {
    for (const example of examples) {
      const pred = sigmoid(dot(weights, example.x) + bias);
      const error = pred - example.y;
      for (let i = 0; i < weights.length; i++) {
        weights[i] -= args.lr * (error * example.x[i]! + args.l2 * weights[i]!);
      }
      bias -= args.lr * error;
    }
  }

  const model = {
    modelId: "taste-linear-mechanical-ranker-v0",
    trainedAt: new Date().toISOString(),
    featureNames: FEATURE_NAMES,
    weights,
    bias,
    training: {
      examples: examples.length,
      epochs: args.epochs,
      lr: args.lr,
      l2: args.l2,
      accuracy: accuracy(examples, weights, bias),
    },
  };

  await mkdir(path.dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, `${JSON.stringify(model, null, 2)}\n`);
  console.log(JSON.stringify({
    modelId: model.modelId,
    output: path.relative(ROOT, args.outPath),
    examples: model.training.examples,
    accuracy: model.training.accuracy,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
