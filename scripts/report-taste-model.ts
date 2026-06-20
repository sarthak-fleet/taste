#!/usr/bin/env bun
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
  minPromoteRealHoldout: number;
  minPromoteTotalHoldout: number;
  minPromoteAccuracy: number;
  minPromoteDelta: number;
}

function parseArgs(argv: string[]): CliArgs {
  let trainPath = "datasets/taste-train.jsonl";
  let testPath = "datasets/taste-holdout.jsonl";
  let modelPath = "models/taste-linear-ranker.json";
  let outPath = "reports/taste-model-report.json";
  let tieMargin = 5;
  let minRealHoldout = 10;
  let minTotalHoldout = 10;
  let minPromoteRealHoldout = 50;
  let minPromoteTotalHoldout = 50;
  let minPromoteAccuracy = 0.7;
  let minPromoteDelta = 0.05;

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
    } else if (arg === "--min-promote-real-holdout" && next) {
      minPromoteRealHoldout = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--min-promote-total-holdout" && next) {
      minPromoteTotalHoldout = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--min-promote-accuracy" && next) {
      minPromoteAccuracy = Number.parseFloat(next);
      i += 1;
    } else if (arg === "--min-promote-delta" && next) {
      minPromoteDelta = Number.parseFloat(next);
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
    minPromoteRealHoldout: Number.isFinite(minPromoteRealHoldout) ? minPromoteRealHoldout : 50,
    minPromoteTotalHoldout: Number.isFinite(minPromoteTotalHoldout) ? minPromoteTotalHoldout : 50,
    minPromoteAccuracy: Number.isFinite(minPromoteAccuracy) ? minPromoteAccuracy : 0.7,
    minPromoteDelta: Number.isFinite(minPromoteDelta) ? minPromoteDelta : 0.05,
  };
}

async function readJsonl(filePath: string): Promise<TasteJsonlRecord[]> {
  const text = await readFile(filePath, "utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as TasteJsonlRecord);
}

function gate(ok: boolean, reasons: string[]) {
  return { ok, reasons };
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
  const holdoutDeltaAccuracy = holdoutRanker.accuracy - holdoutMechanical.accuracy;
  const comparisonReadiness = gate(readiness.ok && holdoutRanker.accuracy >= holdoutMechanical.accuracy, [
    ...readiness.reasons,
    ...(holdoutRanker.accuracy < holdoutMechanical.accuracy
      ? [`Ranker holdout accuracy ${holdoutRanker.accuracy.toFixed(3)} is below mechanical baseline ${holdoutMechanical.accuracy.toFixed(3)}.`]
      : []),
  ]);
  const promotionLabelGate = evaluateTasteJsonlReadiness(holdoutSummary, {
    minRealLabeled: args.minPromoteRealHoldout,
    minTotalLabeled: args.minPromoteTotalHoldout,
  });
  const promotionReadiness = gate(
    promotionLabelGate.ok &&
      holdoutRanker.accuracy >= args.minPromoteAccuracy &&
      holdoutDeltaAccuracy >= args.minPromoteDelta,
    [
      ...promotionLabelGate.reasons,
      ...(holdoutRanker.accuracy < args.minPromoteAccuracy
        ? [`Ranker holdout accuracy ${holdoutRanker.accuracy.toFixed(3)} is below promotion threshold ${args.minPromoteAccuracy.toFixed(3)}.`]
        : []),
      ...(holdoutDeltaAccuracy < args.minPromoteDelta
        ? [`Ranker holdout delta ${holdoutDeltaAccuracy.toFixed(3)} is below promotion threshold ${args.minPromoteDelta.toFixed(3)}.`]
        : []),
    ],
  );
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
    comparisonReadiness,
    promotionReadiness,
    promotionThresholds: {
      minRealHoldout: args.minPromoteRealHoldout,
      minTotalHoldout: args.minPromoteTotalHoldout,
      minAccuracy: args.minPromoteAccuracy,
      minDeltaAccuracy: args.minPromoteDelta,
    },
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
      promotionReadiness.ok
        ? "Ranker is promotion-ready behind TASTE_RANKER_MODEL_JSON."
        : comparisonReadiness.ok
          ? `Ranker is comparison-ready but not promotion-ready: ${promotionReadiness.reasons.join(" ")}`
          : `Do not compare or promote this ranker yet: ${comparisonReadiness.reasons.join(" ")}`,
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
    comparisonReady: report.comparisonReadiness.ok,
    promotionReady: report.promotionReadiness.ok,
    recommendation: report.recommendation,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
