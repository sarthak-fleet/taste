#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface QueueVariant {
  url: string;
  label?: string;
  notes?: string;
}

interface QueueJob {
  id: string;
  label?: string;
  productName?: string;
  studyType?: string;
  targetUserRole?: string;
  primaryObjective?: string;
  sourceKind?: 'manual' | 'curated_gallery' | 'synthetic_degradation' | 'product_feedback';
  sourceNotes?: string;
  contextNotes?: string;
  a: QueueVariant;
  b: QueueVariant;
}

interface CaptureQueue {
  schemaVersion: 1;
  queueId: string;
  defaults?: Omit<QueueJob, 'id' | 'label' | 'a' | 'b'>;
  jobs: QueueJob[];
}

interface CliArgs {
  queuePath: string;
  capturesOut: string;
  pairsOut: string;
  commandsPath: string;
  execute: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let queuePath = 'datasets/taste-capture-queue.json';
  let capturesOut = 'captures/taste-queue';
  let pairsOut = 'captures/taste-pairs';
  let commandsPath = 'reports/taste-capture-queue-commands.sh';
  let execute = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--queue' && next) {
      queuePath = next;
      i += 1;
    } else if (arg === '--captures-out' && next) {
      capturesOut = next;
      i += 1;
    } else if (arg === '--pairs-out' && next) {
      pairsOut = next;
      i += 1;
    } else if (arg === '--commands' && next) {
      commandsPath = next;
      i += 1;
    } else if (arg === '--execute') {
      execute = true;
    }
  }

  return {
    queuePath: path.resolve(ROOT, queuePath),
    capturesOut: path.resolve(ROOT, capturesOut),
    pairsOut: path.resolve(ROOT, pairsOut),
    commandsPath: path.resolve(ROOT, commandsPath),
    execute,
  };
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'taste-job'
  );
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function assertQueue(value: CaptureQueue): asserts value is CaptureQueue {
  if (value?.schemaVersion !== 1 || !value.queueId || !Array.isArray(value.jobs)) {
    throw new Error('Capture queue must have schemaVersion=1, queueId, and jobs[]');
  }
  const ids = new Set<string>();
  for (const job of value.jobs) {
    if (!job.id || ids.has(job.id)) throw new Error('Each capture queue job needs a unique id');
    ids.add(job.id);
    if (!job.a?.url || !job.b?.url) throw new Error(`Job ${job.id} needs a.url and b.url`);
  }
}

function withDefaults(queue: CaptureQueue, job: QueueJob): QueueJob {
  return {
    ...queue.defaults,
    ...job,
    a: job.a,
    b: job.b,
  };
}

function command(args: string[]) {
  return args.map(shellQuote).join(' ');
}

function captureCommand(variant: QueueVariant, outDir: string) {
  const args = [
    'bun',
    'run',
    'capture:taste',
    '--',
    '--url',
    variant.url,
    '--label',
    variant.label ?? slugify(variant.url),
    '--out-dir',
    path.relative(ROOT, outDir),
  ];
  if (variant.notes) args.push('--notes', variant.notes);
  return args;
}

function pairCommand(job: QueueJob, aManifest: string, bManifest: string, pairsOut: string) {
  const sourceKind = job.sourceKind ?? 'curated_gallery';
  const args = [
    'bun',
    'run',
    'pair:taste',
    '--',
    '--a',
    path.relative(ROOT, aManifest),
    '--b',
    path.relative(ROOT, bManifest),
    '--label',
    job.label ?? job.id,
    '--source-kind',
    sourceKind,
    '--out',
    path.relative(ROOT, pairsOut),
  ];
  if (job.productName) args.push('--product-name', job.productName);
  if (job.studyType) args.push('--study-type', job.studyType);
  if (job.targetUserRole) args.push('--target-user', job.targetUserRole);
  if (job.primaryObjective) args.push('--objective', job.primaryObjective);
  if (job.sourceNotes) args.push('--source-notes', job.sourceNotes);
  if (job.contextNotes) args.push('--context-notes', job.contextNotes);
  return args;
}

function jobPaths(args: CliArgs, queue: CaptureQueue, job: QueueJob) {
  const queueDir = path.join(args.capturesOut, slugify(queue.queueId));
  const jobDir = path.join(queueDir, slugify(job.id));
  return {
    aDir: path.join(jobDir, 'a'),
    bDir: path.join(jobDir, 'b'),
    aManifest: path.join(jobDir, 'a', 'manifest.json'),
    bManifest: path.join(jobDir, 'b', 'manifest.json'),
  };
}

async function runCommand(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(args[0]!, args.slice(1), {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(' ')} exited with ${code ?? 'unknown'}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const queue = JSON.parse(await readFile(args.queuePath, 'utf8')) as CaptureQueue;
  assertQueue(queue);
  const scriptLines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `# Generated from ${path.relative(ROOT, args.queuePath)}`,
  ];
  const plan = [];

  for (const rawJob of queue.jobs) {
    const job = withDefaults(queue, rawJob);
    const paths = jobPaths(args, queue, job);
    const captureA = captureCommand(job.a, paths.aDir);
    const captureB = captureCommand(job.b, paths.bDir);
    const createPair = pairCommand(job, paths.aManifest, paths.bManifest, args.pairsOut);

    scriptLines.push('', `# ${job.id}`, command(captureA), command(captureB), command(createPair));
    plan.push({
      id: job.id,
      label: job.label ?? job.id,
      aManifest: path.relative(ROOT, paths.aManifest),
      bManifest: path.relative(ROOT, paths.bManifest),
      pairCommand: command(createPair),
    });

    if (args.execute) {
      await mkdir(paths.aDir, { recursive: true });
      await mkdir(paths.bDir, { recursive: true });
      await runCommand(captureA);
      await runCommand(captureB);
      await runCommand(createPair);
    }
  }

  await mkdir(path.dirname(args.commandsPath), { recursive: true });
  await writeFile(args.commandsPath, `${scriptLines.join('\n')}\n`);

  console.log(
    JSON.stringify(
      {
        queue: path.relative(ROOT, args.queuePath),
        execute: args.execute,
        jobs: queue.jobs.length,
        commands: path.relative(ROOT, args.commandsPath),
        capturesOut: path.relative(ROOT, args.capturesOut),
        pairsOut: path.relative(ROOT, args.pairsOut),
        plan,
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
