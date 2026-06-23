#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateTasteJsonlReadiness,
  summarizeTasteJsonlDataset,
  type TasteJsonlRecord,
} from '../src/lib/tasteJsonl.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface CliArgs {
  inputPath: string;
  minRealLabeled: number;
  minTotalLabeled: number;
  strict: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let inputPath = 'datasets/taste-holdout.jsonl';
  let minRealLabeled = 10;
  let minTotalLabeled = 10;
  let strict = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--in' && next) {
      inputPath = next;
      i += 1;
    } else if (arg === '--min-real' && next) {
      minRealLabeled = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === '--min-total' && next) {
      minTotalLabeled = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === '--strict') {
      strict = true;
    }
  }

  return {
    inputPath: path.resolve(ROOT, inputPath),
    minRealLabeled: Number.isFinite(minRealLabeled) ? minRealLabeled : 10,
    minTotalLabeled: Number.isFinite(minTotalLabeled) ? minTotalLabeled : 10,
    strict,
  };
}

async function readJsonl(filePath: string): Promise<TasteJsonlRecord[]> {
  const text = await readFile(filePath, 'utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TasteJsonlRecord);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = await readJsonl(args.inputPath);
  const summary = summarizeTasteJsonlDataset(records);
  const readiness = evaluateTasteJsonlReadiness(summary, {
    minRealLabeled: args.minRealLabeled,
    minTotalLabeled: args.minTotalLabeled,
  });
  const payload = {
    dataset: path.relative(ROOT, args.inputPath),
    summary,
    readiness,
  };

  console.log(JSON.stringify(payload, null, 2));
  if (args.strict && !readiness.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
