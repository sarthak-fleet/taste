#!/usr/bin/env bun
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TASTE_CRITERIA,
  type TasteCriterion,
  type TastePairManifest,
  type TastePairPreference,
} from '../src/lib/tasteDataset.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFERENCES = new Set<TastePairPreference>(['a', 'b', 'tie', 'unknown']);

interface CliArgs {
  pairPath?: string;
  pairId?: string;
  inputDir: string;
  preferred?: TastePairPreference;
  confidence?: number;
  rationale?: string;
  criteria?: Partial<Record<TasteCriterion, TastePairPreference>>;
  annotator?: string;
  clear: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let pairPath: string | undefined;
  let pairId: string | undefined;
  let inputDir = 'captures/taste-pairs';
  let preferred: TastePairPreference | undefined;
  let confidence: number | undefined;
  let rationale: string | undefined;
  let annotator: string | undefined;
  let criteria: Partial<Record<TasteCriterion, TastePairPreference>> | undefined;
  let clear = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--pair' && next) {
      pairPath = next;
      i += 1;
    } else if (arg === '--id' && next) {
      pairId = next;
      i += 1;
    } else if (arg === '--in' && next) {
      inputDir = next;
      i += 1;
    } else if (arg === '--preferred' && next) {
      preferred = assertPreference(next, '--preferred');
      i += 1;
    } else if (arg === '--confidence' && next) {
      confidence = Number.parseFloat(next);
      i += 1;
    } else if (arg === '--rationale' && next) {
      rationale = next;
      i += 1;
    } else if (arg === '--criteria' && next) {
      criteria = parseCriterionPreferences(next);
      i += 1;
    } else if (arg === '--annotator' && next) {
      annotator = next;
      i += 1;
    } else if (arg === '--clear') {
      clear = true;
    }
  }

  if (
    confidence !== undefined &&
    (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
  ) {
    throw new Error('--confidence must be a number from 0 to 1');
  }

  return {
    pairPath,
    pairId,
    inputDir: path.resolve(ROOT, inputDir),
    preferred,
    confidence,
    rationale,
    criteria,
    annotator,
    clear,
  };
}

function assertPreference(value: string, label: string): TastePairPreference {
  if (!PREFERENCES.has(value as TastePairPreference)) {
    throw new Error(`${label} must be one of: a, b, tie, unknown`);
  }
  return value as TastePairPreference;
}

function parseCriterionPreferences(
  value: string
): Partial<Record<TasteCriterion, TastePairPreference>> {
  const out: Partial<Record<TasteCriterion, TastePairPreference>> = {};
  for (const entry of value.split(',')) {
    const [criterion, preference] = entry.split(':').map((part) => part?.trim());
    if (!criterion || !TASTE_CRITERIA.includes(criterion as TasteCriterion)) {
      throw new Error(`Unknown Taste criterion "${criterion ?? ''}"`);
    }
    out[criterion as TasteCriterion] = assertPreference(preference ?? '', `Criterion ${criterion}`);
  }
  return out;
}

async function findJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return findJsonFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith('.json')) return [fullPath];
      return [];
    })
  );
  return nested.flat().sort();
}

async function resolvePairPath(args: CliArgs) {
  if (args.pairPath) return path.resolve(ROOT, args.pairPath);
  if (!args.pairId) throw new Error('Pass --pair <path> or --id <pairId>');

  const files = await findJsonFiles(args.inputDir);
  for (const file of files) {
    const pair = JSON.parse(await readFile(file, 'utf8')) as TastePairManifest;
    if (pair.schemaVersion === 1 && pair.pairId === args.pairId) return file;
  }
  throw new Error(
    `Could not find pair id ${args.pairId} under ${path.relative(ROOT, args.inputDir)}`
  );
}

function usage() {
  return [
    'Usage:',
    'bun label:taste-pair -- --pair captures/taste-pairs/example.json --preferred a --confidence 0.8 --rationale "Cleaner above fold"',
    'bun label:taste-pair -- --id <pairId> --preferred tie --annotator sarthak',
    'bun label:taste-pair -- --pair captures/taste-pairs/example.json --clear',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.clear && !args.preferred) {
    console.error(usage());
    process.exit(2);
  }

  const pairPath = await resolvePairPath(args);
  const pair = JSON.parse(await readFile(pairPath, 'utf8')) as TastePairManifest;
  if (pair.schemaVersion !== 1 || !Array.isArray(pair.variants) || pair.variants.length !== 2) {
    throw new Error(`${path.relative(ROOT, pairPath)} is not a Taste pair manifest`);
  }

  if (args.clear) {
    delete pair.label;
  } else {
    pair.label = {
      preferredVariantId: args.preferred!,
      confidence: args.confidence,
      rationale: args.rationale,
      criterionPreferences: args.criteria,
      annotator: args.annotator,
      labeledAt: new Date().toISOString(),
    };
  }

  await writeFile(pairPath, `${JSON.stringify(pair, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        pair: path.relative(ROOT, pairPath),
        pairId: pair.pairId,
        label: pair.label?.preferredVariantId ?? null,
        confidence: pair.label?.confidence ?? null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
