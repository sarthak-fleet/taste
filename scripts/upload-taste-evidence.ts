#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TasteCaptureManifest } from '../src/lib/visualEvidence.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface CliArgs {
  api: string;
  studyId: string;
  captures: Array<{ variantId?: string; variantLabel?: string; manifestPath: string }>;
  runBaseline: boolean;
  token?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const captures: CliArgs['captures'] = [];
  let api = 'http://127.0.0.1:8788/api';
  let studyId = '';
  let runBaseline = true;
  let token: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--api' && next) {
      api = next.replace(/\/$/, '');
      i += 1;
    } else if (arg === '--study' && next) {
      studyId = next;
      i += 1;
    } else if (arg === '--capture' && next) {
      captures.push(parseCaptureSpec(next));
      i += 1;
    } else if (arg === '--token' && next) {
      token = next;
      i += 1;
    } else if (arg === '--no-baseline') {
      runBaseline = false;
    }
  }

  if (!studyId || captures.length === 0) {
    throw new Error(
      'Usage: pnpm evidence:taste -- --study <study-id> --capture <variant-id-or-label>=captures/.../manifest.json [--api http://127.0.0.1:8788/api] [--token shared-secret]'
    );
  }

  return { api, studyId, captures, runBaseline, token };
}

function parseCaptureSpec(value: string): CliArgs['captures'][number] {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid --capture "${value}". Expected <variant-id-or-label>=<manifest-path>`);
  }

  const key = value.slice(0, separator);
  const manifestPath = value.slice(separator + 1);
  const variantKey = key.length <= 2 ? { variantLabel: key } : { variantId: key };
  return { ...variantKey, manifestPath };
}

async function readManifest(manifestPath: string): Promise<TasteCaptureManifest> {
  const absolute = path.resolve(ROOT, manifestPath);
  const manifest = JSON.parse(await readFile(absolute, 'utf8')) as TasteCaptureManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts)) {
    throw new Error(`${manifestPath} is not a Taste capture manifest`);
  }
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const captures = await Promise.all(
    args.captures.map(async (capture) => ({
      variantId: capture.variantId,
      variantLabel: capture.variantLabel,
      manifest: await readManifest(capture.manifestPath),
    }))
  );

  const response = await fetch(`${args.api}/studies/${args.studyId}/visual-evidence`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(args.token ? { authorization: `Bearer ${args.token}` } : {}),
    },
    body: JSON.stringify({ captures, runBaseline: args.runBaseline }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Upload failed with ${response.status}`);
  }

  console.log(`Uploaded ${captures.length} capture manifest(s) to study ${args.studyId}`);
  console.log(`Persisted: ${payload.persisted?.length ?? 0}`);
  if (payload.baseline) {
    console.log(
      `Baseline: ${payload.baseline.modelId}, winner=${payload.baseline.overallWinnerVariantId ?? 'tie'}, confidence=${payload.baseline.overallConfidence}`
    );
  } else {
    console.log('Baseline: not run');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
