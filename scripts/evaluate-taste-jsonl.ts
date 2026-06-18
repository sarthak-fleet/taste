#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
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

interface CliArgs {
  inputPath: string;
  tieMargin: number;
  modelPath?: string;
}

interface RankerModel {
  modelId: string;
  featureNames: typeof FEATURE_NAMES;
  weights: number[];
  bias: number;
}

function parseArgs(argv: string[]): CliArgs {
  let inputPath = "datasets/taste-pairs.jsonl";
  let tieMargin = 5;
  let modelPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--in" && next) {
      inputPath = next;
      i += 1;
    } else if (arg === "--tie-margin" && next) {
      tieMargin = Number.parseFloat(next);
      i += 1;
    } else if (arg === "--model" && next) {
      modelPath = next;
      i += 1;
    }
  }

  return {
    inputPath: path.resolve(ROOT, inputPath),
    tieMargin: Number.isFinite(tieMargin) ? tieMargin : 5,
    modelPath: modelPath ? path.resolve(ROOT, modelPath) : undefined,
  };
}

function featureVector(record: TasteJsonlRecord): number[] | null {
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

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function predictWithModel(record: TasteJsonlRecord, model: RankerModel): Preference {
  const x = featureVector(record);
  if (!x) return "unknown";
  const logit = model.weights.reduce((sum, weight, index) => sum + weight * (x[index] ?? 0), model.bias);
  const probA = sigmoid(logit);
  if (probA > 0.55) return "a";
  if (probA < 0.45) return "b";
  return "tie";
}

function predictMechanically(record: TasteJsonlRecord, tieMargin: number): Preference {
  const [a, b] = record.variants;
  if (!a || !b) return "unknown";
  const aRisk = a.mechanicalSummary.highestRiskScore;
  const bRisk = b.mechanicalSummary.highestRiskScore;
  if (Math.abs(aRisk - bRisk) <= tieMargin) return "tie";
  return aRisk < bRisk ? "a" : "b";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = args.modelPath
    ? (JSON.parse(await readFile(args.modelPath, "utf8")) as RankerModel)
    : null;
  const lines = (await readFile(args.inputPath, "utf8")).split("\n").filter(Boolean);
  const records = lines.map((line) => JSON.parse(line) as TasteJsonlRecord);
  const labeled = records.filter((record) => record.label && record.label.preferredVariantId !== "unknown");
  const scored = labeled.map((record) => ({
    id: record.id,
    predicted: model ? predictWithModel(record, model) : predictMechanically(record, args.tieMargin),
    actual: record.label!.preferredVariantId,
  }));
  const correct = scored.filter((row) => row.predicted === row.actual).length;
  const accuracy = scored.length ? correct / scored.length : 0;

  console.log(JSON.stringify({
    metric: model ? "trained_ranker_pairwise_accuracy" : "mechanical_risk_pairwise_accuracy",
    modelId: model?.modelId ?? "mechanical-risk-baseline",
    records: records.length,
    labeled: labeled.length,
    correct,
    accuracy,
    tieMargin: args.tieMargin,
    misses: scored.filter((row) => row.predicted !== row.actual).slice(0, 20),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
