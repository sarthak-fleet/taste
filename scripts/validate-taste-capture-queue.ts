#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_KINDS = new Set(["manual", "curated_gallery", "synthetic_degradation", "product_feedback"]);

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
  sourceKind?: string;
  sourceNotes?: string;
  contextNotes?: string;
  a: QueueVariant;
  b: QueueVariant;
}

interface CaptureQueue {
  schemaVersion: 1;
  queueId: string;
  defaults?: Partial<QueueJob>;
  jobs: QueueJob[];
}

interface CliArgs {
  queuePath: string;
  checkUrls: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let queuePath = "datasets/taste-capture-queue.json";
  let checkUrls = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--queue" && next) {
      queuePath = next;
      i += 1;
    } else if (arg === "--check-urls") {
      checkUrls = true;
    }
  }

  return {
    queuePath: path.resolve(ROOT, queuePath),
    checkUrls,
  };
}

function validateUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function sourceKindFor(queue: CaptureQueue, job: QueueJob) {
  return job.sourceKind ?? queue.defaults?.sourceKind ?? "curated_gallery";
}

function validateQueue(queue: CaptureQueue) {
  const errors: string[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();

  if (queue.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!queue.queueId) errors.push("queueId is required");
  if (!Array.isArray(queue.jobs) || queue.jobs.length === 0) errors.push("jobs[] must contain at least one job");

  for (const job of queue.jobs ?? []) {
    if (!job.id) errors.push("Each job needs an id");
    if (job.id && ids.has(job.id)) errors.push(`Duplicate job id: ${job.id}`);
    if (job.id) ids.add(job.id);

    const sourceKind = sourceKindFor(queue, job);
    if (!SOURCE_KINDS.has(sourceKind)) errors.push(`Job ${job.id || "(missing id)"} has invalid sourceKind ${sourceKind}`);
    for (const side of ["a", "b"] as const) {
      const variant = job[side];
      if (!variant?.url) {
        errors.push(`Job ${job.id || "(missing id)"} is missing ${side}.url`);
        continue;
      }
      if (!validateUrl(variant.url)) errors.push(`Job ${job.id || "(missing id)"} has invalid ${side}.url`);
      urls.add(variant.url);
    }
    if (job.a?.url && job.b?.url && job.a.url === job.b.url) errors.push(`Job ${job.id} compares a URL to itself`);
  }

  return {
    ok: errors.length === 0,
    errors,
    jobs: queue.jobs?.length ?? 0,
    uniqueUrls: urls.size,
  };
}

async function checkUrl(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    return {
      url,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const queue = JSON.parse(await readFile(args.queuePath, "utf8")) as CaptureQueue;
  const validation = validateQueue(queue);
  const urls = [...new Set((queue.jobs ?? []).flatMap((job) => [job.a?.url, job.b?.url].filter(Boolean) as string[]))];
  const urlChecks = args.checkUrls ? await Promise.all(urls.map(checkUrl)) : undefined;
  const urlFailures = urlChecks?.filter((result) => !result.ok) ?? [];
  const ok = validation.ok && urlFailures.length === 0;

  console.log(JSON.stringify({
    queue: path.relative(ROOT, args.queuePath),
    ok,
    validation,
    urlChecks,
  }, null, 2));

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
