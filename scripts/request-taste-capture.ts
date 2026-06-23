#!/usr/bin/env bun
interface CliArgs {
  api: string;
  studyId: string;
}

function parseArgs(argv: string[]): CliArgs {
  let api = 'http://127.0.0.1:8788/api';
  let studyId = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--api' && next) {
      api = next.replace(/\/$/, '');
      i += 1;
    } else if (arg === '--study' && next) {
      studyId = next;
      i += 1;
    }
  }

  if (!studyId) {
    throw new Error(
      'Usage: bun capture-study:taste -- --study <study-id> [--api http://127.0.0.1:8788/api]'
    );
  }

  return { api, studyId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const response = await fetch(`${args.api}/studies/${args.studyId}/capture`, { method: 'POST' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Capture trigger failed with ${response.status}`);
  }

  console.log(`Requested capture for study ${args.studyId}`);
  console.log(`Captured: ${payload.captured?.length ?? 0}`);
  if (payload.callback?.baseline) {
    console.log(
      `Baseline: ${payload.callback.baseline.modelId}, winner=${payload.callback.baseline.overallWinnerVariantId ?? 'tie'}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
