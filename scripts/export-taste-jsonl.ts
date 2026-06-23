#!/usr/bin/env bun
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TastePairManifest } from '../src/lib/tasteDataset.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface CliArgs {
  inputDir: string;
  outPath: string;
  includeUnlabeled: boolean;
}

interface JsonlRecord {
  id: string;
  context: TastePairManifest['context'];
  source: TastePairManifest['source'];
  variants: Array<{
    id: string;
    label: string;
    url: string;
    artifacts: TastePairManifest['variants'][number]['artifacts'];
    screenshots: Array<{
      viewport: string;
      aboveFoldPath: string;
      fullPagePath: string;
    }>;
    mechanicalSummary: TastePairManifest['variants'][number]['mechanicalSummary'];
  }>;
  label: TastePairManifest['label'] | null;
}

function parseArgs(argv: string[]): CliArgs {
  let inputDir = 'captures/taste-pairs';
  let outPath = 'datasets/taste-pairs.jsonl';
  let includeUnlabeled = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--in' && next) {
      inputDir = next;
      i += 1;
    } else if (arg === '--out' && next) {
      outPath = next;
      i += 1;
    } else if (arg === '--include-unlabeled') {
      includeUnlabeled = true;
    }
  }

  return {
    inputDir: path.resolve(ROOT, inputDir),
    outPath: path.resolve(ROOT, outPath),
    includeUnlabeled,
  };
}

async function findJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return findJsonFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith('.json')) return [fullPath];
      return [];
    })
  );
  return files.flat().sort();
}

async function readPair(filePath: string): Promise<TastePairManifest | null> {
  const pair = JSON.parse(await readFile(filePath, 'utf8')) as TastePairManifest;
  if (pair.schemaVersion !== 1 || !Array.isArray(pair.variants) || pair.variants.length !== 2)
    return null;
  return pair;
}

function toRecord(pair: TastePairManifest): JsonlRecord {
  return {
    id: pair.pairId,
    context: pair.context,
    source: pair.source,
    variants: pair.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      url: variant.url,
      artifacts: variant.artifacts,
      screenshots: variant.artifacts.map((artifact) => ({
        viewport: artifact.viewport,
        aboveFoldPath: artifact.aboveFoldPath,
        fullPagePath: artifact.fullPagePath,
      })),
      mechanicalSummary: variant.mechanicalSummary,
    })),
    label: pair.label ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await findJsonFiles(args.inputDir);
  const records: JsonlRecord[] = [];

  for (const file of files) {
    const pair = await readPair(file);
    if (!pair) continue;
    if (!args.includeUnlabeled && !pair.label) continue;
    records.push(toRecord(pair));
  }

  await mkdir(path.dirname(args.outPath), { recursive: true });
  await writeFile(
    args.outPath,
    records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '')
  );
  console.log(
    `Exported ${records.length} Taste pair record(s) to ${path.relative(ROOT, args.outPath)}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
