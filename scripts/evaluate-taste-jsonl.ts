#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateTasteJsonl,
  predictTasteJsonlMechanically,
  predictTasteJsonlWithModel,
  type TasteJsonlRecord,
} from "../src/lib/tasteJsonl.ts";
import { parseTasteLinearRankerModelJson } from "../src/lib/tasteRanker.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface CliArgs {
  inputPath: string;
  tieMargin: number;
  modelPath?: string;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = args.modelPath
    ? parseTasteLinearRankerModelJson(await readFile(args.modelPath, "utf8"))
    : null;
  const lines = (await readFile(args.inputPath, "utf8")).split("\n").filter(Boolean);
  const records = lines.map((line) => JSON.parse(line) as TasteJsonlRecord);
  const result = evaluateTasteJsonl(records, (record) =>
    model ? predictTasteJsonlWithModel(record, model) : predictTasteJsonlMechanically(record, args.tieMargin),
  );

  console.log(JSON.stringify({
    metric: model ? "trained_ranker_pairwise_accuracy" : "mechanical_risk_pairwise_accuracy",
    modelId: model?.modelId ?? "mechanical-risk-baseline",
    records: result.records,
    labeled: result.labeled,
    correct: result.correct,
    accuracy: result.accuracy,
    tieMargin: args.tieMargin,
    misses: result.misses.slice(0, 20),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
