#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTasteMechanicalBaseline } from "../src/lib/tasteBaseline.ts";
import type { TastePairManifest, TastePairPreference } from "../src/lib/tasteDataset.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, "true");
    } else {
      args.set(key, next);
      i += 1;
    }
  }
  return args;
}

function resolvePath(value: string): string {
  return path.resolve(ROOT, value);
}

function relativeToRoot(value: string): string {
  return path.relative(ROOT, value);
}

function preferenceFromWinner(winnerVariantId: string | null): TastePairPreference {
  if (winnerVariantId === "a" || winnerVariantId === "b") return winnerVariantId;
  return "tie";
}

function labelMatches(predicted: TastePairPreference, label?: TastePairManifest["label"]): boolean | null {
  if (!label || label.preferredVariantId === "unknown") return null;
  return predicted === label.preferredVariantId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pairPathArg = args.get("pair");
  if (!pairPathArg) {
    console.error("Usage: pnpm baseline:taste -- --pair captures/taste-pairs/example.json [--out captures/taste-results]");
    process.exit(2);
  }

  const pairPath = resolvePath(pairPathArg);
  const pair = JSON.parse(await readFile(pairPath, "utf8")) as TastePairManifest;
  if (pair.schemaVersion !== 1 || !Array.isArray(pair.variants) || pair.variants.length !== 2) {
    throw new Error(`${pairPath} is not a Taste pair manifest`);
  }

  const result = runTasteMechanicalBaseline(pair);
  const predictedPreference = preferenceFromWinner(result.overallWinnerVariantId);
  const evaluation = {
    pairPath: relativeToRoot(pairPath),
    pairId: pair.pairId,
    modelId: result.modelId,
    predictedPreference,
    labelPreference: pair.label?.preferredVariantId ?? null,
    labelMatch: labelMatches(predictedPreference, pair.label),
    overallConfidence: result.overallConfidence,
    pairwiseVerdictCount: result.pairwiseVerdicts.length,
    summary: result.summary,
    result,
  };

  const outBase = resolvePath(args.get("out") || "captures/taste-baseline");
  await mkdir(outBase, { recursive: true });
  const outPath = path.join(outBase, `${pair.pairId}-${result.modelId}.json`);
  await writeFile(outPath, `${JSON.stringify(evaluation, null, 2)}\n`);

  const labelStatus =
    evaluation.labelMatch == null ? "no comparable label" : evaluation.labelMatch ? "label match" : "label mismatch";
  console.log(`Evaluated Taste pair ${pair.pairId}`);
  console.log(`Output: ${relativeToRoot(outPath)}`);
  console.log(`Prediction: ${predictedPreference}, confidence=${result.overallConfidence.toFixed(2)} (${labelStatus})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
