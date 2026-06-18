#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
}

function parseArgs(argv: string[]): CliArgs {
  let inputPath = "datasets/taste-pairs.jsonl";
  let tieMargin = 5;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--in" && next) {
      inputPath = next;
      i += 1;
    } else if (arg === "--tie-margin" && next) {
      tieMargin = Number.parseFloat(next);
      i += 1;
    }
  }

  return {
    inputPath: path.resolve(ROOT, inputPath),
    tieMargin: Number.isFinite(tieMargin) ? tieMargin : 5,
  };
}

function predict(record: TasteJsonlRecord, tieMargin: number): Preference {
  const [a, b] = record.variants;
  if (!a || !b) return "unknown";

  const aRisk = a.mechanicalSummary.highestRiskScore;
  const bRisk = b.mechanicalSummary.highestRiskScore;
  if (Math.abs(aRisk - bRisk) <= tieMargin) return "tie";
  return aRisk < bRisk ? "a" : "b";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lines = (await readFile(args.inputPath, "utf8")).split("\n").filter(Boolean);
  const records = lines.map((line) => JSON.parse(line) as TasteJsonlRecord);
  const labeled = records.filter((record) => record.label && record.label.preferredVariantId !== "unknown");
  const scored = labeled.map((record) => ({
    id: record.id,
    predicted: predict(record, args.tieMargin),
    actual: record.label!.preferredVariantId,
  }));
  const correct = scored.filter((row) => row.predicted === row.actual).length;
  const accuracy = scored.length ? correct / scored.length : 0;

  console.log(JSON.stringify({
    metric: "mechanical_risk_pairwise_accuracy",
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
