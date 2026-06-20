#!/usr/bin/env bun
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TastePairManifest, TastePairPreference } from "../src/lib/tasteDataset.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface CliArgs {
  inputDir: string;
  minRealLabeled: number;
  minTotalLabeled: number;
  strict: boolean;
}

interface PairAuditSummary {
  pairs: number;
  labeled: number;
  unlabeled: number;
  realLabeled: number;
  syntheticLabeled: number;
  sourceCounts: Record<string, number>;
  labelCounts: Record<TastePairPreference, number>;
  unlabeledPairs: Array<{ pairId: string; path: string; sourceKind: string }>;
}

function parseArgs(argv: string[]): CliArgs {
  let inputDir = "captures/taste-pairs";
  let minRealLabeled = 10;
  let minTotalLabeled = 10;
  let strict = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--in" && next) {
      inputDir = next;
      i += 1;
    } else if (arg === "--min-real" && next) {
      minRealLabeled = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--min-total" && next) {
      minTotalLabeled = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--strict") {
      strict = true;
    }
  }

  return {
    inputDir: path.resolve(ROOT, inputDir),
    minRealLabeled: Number.isFinite(minRealLabeled) ? minRealLabeled : 10,
    minTotalLabeled: Number.isFinite(minTotalLabeled) ? minTotalLabeled : 10,
    strict,
  };
}

async function findJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return findJsonFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith(".json")) return [fullPath];
      return [];
    }),
  );
  return nested.flat().sort();
}

async function readPair(filePath: string): Promise<TastePairManifest | null> {
  const pair = JSON.parse(await readFile(filePath, "utf8")) as TastePairManifest;
  if (pair.schemaVersion !== 1 || !Array.isArray(pair.variants) || pair.variants.length !== 2) return null;
  return pair;
}

function isLabeled(pair: TastePairManifest) {
  return Boolean(pair.label && pair.label.preferredVariantId !== "unknown");
}

function summarize(pairs: Array<{ pair: TastePairManifest; filePath: string }>): PairAuditSummary {
  const sourceCounts: Record<string, number> = {};
  const labelCounts = {
    a: 0,
    b: 0,
    tie: 0,
    unknown: 0,
  } satisfies Record<TastePairPreference, number>;
  const unlabeledPairs: PairAuditSummary["unlabeledPairs"] = [];
  let labeled = 0;
  let realLabeled = 0;
  let syntheticLabeled = 0;

  for (const { pair, filePath } of pairs) {
    const sourceKind = pair.source.kind;
    sourceCounts[sourceKind] = (sourceCounts[sourceKind] ?? 0) + 1;
    const preference = pair.label?.preferredVariantId ?? "unknown";
    labelCounts[preference] += 1;

    if (!isLabeled(pair)) {
      unlabeledPairs.push({
        pairId: pair.pairId,
        path: path.relative(ROOT, filePath),
        sourceKind,
      });
      continue;
    }

    labeled += 1;
    if (sourceKind === "synthetic_degradation") syntheticLabeled += 1;
    else realLabeled += 1;
  }

  return {
    pairs: pairs.length,
    labeled,
    unlabeled: unlabeledPairs.length,
    realLabeled,
    syntheticLabeled,
    sourceCounts,
    labelCounts,
    unlabeledPairs: unlabeledPairs.slice(0, 50),
  };
}

function readiness(summary: PairAuditSummary, params: { minRealLabeled: number; minTotalLabeled: number }) {
  const reasons: string[] = [];
  if (summary.labeled < params.minTotalLabeled) {
    reasons.push(`Need at least ${params.minTotalLabeled} total labeled pairs; found ${summary.labeled}.`);
  }
  if (summary.realLabeled < params.minRealLabeled) {
    reasons.push(`Need at least ${params.minRealLabeled} real non-synthetic labeled pairs; found ${summary.realLabeled}.`);
  }
  if (summary.syntheticLabeled > 0 && summary.realLabeled === 0) {
    reasons.push("Pair collection has synthetic labels but no real labels.");
  }

  return {
    ok: reasons.length === 0,
    minRealLabeled: params.minRealLabeled,
    minTotalLabeled: params.minTotalLabeled,
    reasons,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await findJsonFiles(args.inputDir);
  const pairs = [];
  for (const filePath of files) {
    const pair = await readPair(filePath);
    if (pair) pairs.push({ pair, filePath });
  }
  const summary = summarize(pairs);
  const gate = readiness(summary, {
    minRealLabeled: args.minRealLabeled,
    minTotalLabeled: args.minTotalLabeled,
  });

  console.log(JSON.stringify({
    input: path.relative(ROOT, args.inputDir),
    summary,
    readiness: gate,
  }, null, 2));
  if (args.strict && !gate.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
