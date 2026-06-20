#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TasteJsonlRecord } from "../src/lib/tasteJsonl.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface CliArgs {
  inputPath: string;
  trainPath: string;
  testPath: string;
  holdout: number;
  minTestRecords: number;
  seed: string;
}

function parseArgs(argv: string[]): CliArgs {
  let inputPath = "datasets/taste-pairs.jsonl";
  let trainPath = "datasets/taste-train.jsonl";
  let testPath = "datasets/taste-holdout.jsonl";
  let holdout = 0.2;
  let minTestRecords = 0;
  let seed = "taste-v1";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--in" && next) {
      inputPath = next;
      i += 1;
    } else if (arg === "--train" && next) {
      trainPath = next;
      i += 1;
    } else if (arg === "--test" && next) {
      testPath = next;
      i += 1;
    } else if (arg === "--holdout" && next) {
      holdout = Number.parseFloat(next);
      i += 1;
    } else if (arg === "--min-test-records" && next) {
      minTestRecords = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--seed" && next) {
      seed = next;
      i += 1;
    }
  }

  return {
    inputPath: path.resolve(ROOT, inputPath),
    trainPath: path.resolve(ROOT, trainPath),
    testPath: path.resolve(ROOT, testPath),
    holdout: Number.isFinite(holdout) ? Math.max(0.05, Math.min(0.8, holdout)) : 0.2,
    minTestRecords: Number.isFinite(minTestRecords) ? Math.max(0, minTestRecords) : 0,
    seed,
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function writeJsonl(filePath: string, records: TasteJsonlRecord[]) {
  return writeFile(filePath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""));
}

function assignSplits(records: TasteJsonlRecord[], holdout: number, minTestRecords: number, seed: string) {
  const labeled = records.filter((record) => record.label && record.label.preferredVariantId !== "unknown");
  const unlabeled = records.filter((record) => !record.label || record.label.preferredVariantId === "unknown");
  const sorted = [...labeled].sort((a, b) => hashString(`${seed}:${a.id}`) - hashString(`${seed}:${b.id}`));
  const requestedTestCount = Math.max(1, Math.round(sorted.length * holdout), minTestRecords);
  const testCount = sorted.length <= 1 ? 0 : Math.min(sorted.length - 1, requestedTestCount);
  const testIds = new Set(sorted.slice(0, testCount).map((record) => record.id));

  return {
    train: records.filter((record) => !testIds.has(record.id)),
    test: records.filter((record) => testIds.has(record.id)),
    labeled: labeled.length,
    unlabeled: unlabeled.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lines = (await readFile(args.inputPath, "utf8")).split("\n").filter(Boolean);
  const records = lines.map((line) => JSON.parse(line) as TasteJsonlRecord);
  const split = assignSplits(records, args.holdout, args.minTestRecords, args.seed);

  if (split.labeled < 2) {
    throw new Error("Need at least two labeled records before creating a held-out split");
  }
  if (args.minTestRecords > 0 && split.test.length < args.minTestRecords) {
    throw new Error(
      `Need at least ${args.minTestRecords + 1} labeled records to reserve ${args.minTestRecords} heldout records and keep one training record; found ${split.labeled}`,
    );
  }

  await mkdir(path.dirname(args.trainPath), { recursive: true });
  await mkdir(path.dirname(args.testPath), { recursive: true });
  await writeJsonl(args.trainPath, split.train);
  await writeJsonl(args.testPath, split.test);

  console.log(JSON.stringify({
    input: path.relative(ROOT, args.inputPath),
    train: path.relative(ROOT, args.trainPath),
    test: path.relative(ROOT, args.testPath),
    records: records.length,
    labeled: split.labeled,
    unlabeled: split.unlabeled,
    trainRecords: split.train.length,
    testRecords: split.test.length,
    holdout: args.holdout,
    minTestRecords: args.minTestRecords,
    seed: args.seed,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
