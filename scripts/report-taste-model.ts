#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateTasteJsonlReadiness,
  evaluateTasteJsonl,
  predictTasteJsonlMechanically,
  predictTasteJsonlWithModel,
  summarizeTasteJsonlDataset,
  type TasteJsonlRecord,
} from "../src/lib/tasteJsonl.ts";
import { parseTasteLinearRankerModelJson } from "../src/lib/tasteRanker.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface CliArgs {
  trainPath: string;
  testPath: string;
  modelPath: string;
  outPath: string;
  tieMargin: number;
  minRealHoldout: number;
  minTotalHoldout: number;
}

function parseArgs(argv: string[]): CliArgs {
  let trainPath = "datasets/taste-train.jsonl";
  let testPath = "datasets/taste-holdout.jsonl";
  let modelPath = "models/taste-linear-ranker.json";
  let outPath = "reports/taste-model-report.json";
  let tieMargin = 5;
  let minRealHoldout = 10;
  let minTotalHoldout = 10;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--train" && next) {
      trainPath = next;
      i += 1;
    } else if (arg === "--test" && next) {
      testPath = next;
      i += 1;
    } else if (arg === "--model" && next) {
      modelPath = next;
      i += 1;
    } else if (arg === "--out" && next) {
      outPath = next;
      i += 1;
    } else if (arg === "--tie-margin" && next) {
      tieMargin = Number.parseFloat(next);
      i += 1;
    } else if (arg === "--min-real-holdout" && next) {
      minRealHoldout = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--min-total-holdout" && next) {
      minTotalHoldout = Number.parseInt(next, 10);
      i += 1;
    }
  }

  return {
    trainPath: path.resolve(ROOT, trainPath),
    testPath: path.resolve(ROOT, testPath),
    modelPath: path.resolve(ROOT, modelPath),
    outPath: path.resolve(ROOT, outPath),
    tieMargin: Number.isFinite(tieMargin) ? tieMargin : 5,
    minRealHoldout: Number.isFinite(minRealHoldout) ? minRealHoldout : 10,
    minTotalHoldout: Number.isFinite(minTotalHoldout) ? minTotalHoldout : 10,
  };
}

async function readJsonl(filePath: string): Promise<TasteJsonlRecord[]> {
  const text = await readFile(filePath, "utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as TasteJsonlRecord);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [trainRecords, testRecords, modelJson] = await Promise.all([
    readJsonl(args.trainPath),
    readJsonl(args.testPath),
    readFile(args.modelPath, "utf8"),
  ]);
  const model = parseTasteLinearRankerModelJson(modelJson);
  const evaluateMechanical = (records: TasteJsonlRecord[]) =>
    evaluateTasteJsonl(records, (record) => predictTasteJsonlMechanically(record, args.tieMargin));
  const evaluateRanker = (records: TasteJsonlRecord[]) =>
    evaluateTasteJsonl(records, (record) => predictTasteJsonlWithModel(record, model));
  const trainMechanical = evaluateMechanical(trainRecords);
  const trainRanker = evaluateRanker(trainRecords);
  const holdoutMechanical = evaluateMechanical(testRecords);
  const holdoutRanker = evaluateRanker(testRecords);
  const holdoutSummary = summarizeTasteJsonlDataset(testRecords);
  const readiness = evaluateTasteJsonlReadiness(holdoutSummary, {
    minRealLabeled: args.minRealHoldout,
    minTotalLabeled: args.minTotalHoldout,
  });
  const report = {
    generatedAt: new Date().toISOString(),
    modelId: model.modelId,
    modelPath: path.relative(ROOT, args.modelPath),
    tieMargin: args.tieMargin,
    datasets: {
      train: summarizeTasteJsonlDataset(trainRecords),
      holdout: holdoutSummary,
    },
    readiness,
    metrics: {
      train: {
        mechanical: trainMechanical,
        ranker: trainRanker,
        deltaAccuracy: trainRanker.accuracy - trainMechanical.accuracy,
      },
      holdout: {
        mechanical: holdoutMechanical,
        ranker: holdoutRanker,
        deltaAccuracy: holdoutRanker.accuracy - holdoutMechanical.accuracy,
      },
    },
    recommendation:
      !readiness.ok
        ? `Holdout is not promotion-ready: ${readiness.reasons.join(" ")}`
        : holdoutRanker.accuracy >= holdoutMechanical.accuracy
          ? "Ranker is safe to compare in product behind TASTE_RANKER_MODEL_JSON."
          : "Do not promote this ranker; collect more labels or adjust features.",
  };

  await mkdir(path.dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    report: path.relative(ROOT, args.outPath),
    modelId: report.modelId,
    trainAccuracy: report.metrics.train.ranker.accuracy,
    holdoutAccuracy: report.metrics.holdout.ranker.accuracy,
    holdoutBaselineAccuracy: report.metrics.holdout.mechanical.accuracy,
    readiness: report.readiness.ok,
    recommendation: report.recommendation,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
