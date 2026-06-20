#!/usr/bin/env bun
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TastePairManifest } from "../src/lib/tasteDataset.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface CliArgs {
  inputDir: string;
  outPath: string;
  includeLabeled: boolean;
  format: "html" | "json";
}

interface QueueItem {
  pairId: string;
  pairPath: string;
  sourceKind: string;
  label: string | null;
  variants: Array<{
    id: string;
    label: string;
    url: string;
    risk: TastePairManifest["variants"][number]["mechanicalSummary"];
    screenshots: Array<{
      viewport: string;
      aboveFoldPath: string;
      fullPagePath: string;
    }>;
  }>;
  labelCommands: {
    a: string;
    b: string;
    tie: string;
  };
}

function parseArgs(argv: string[]): CliArgs {
  let inputDir = "captures/taste-pairs";
  let outPath = "reports/taste-label-queue.html";
  let includeLabeled = false;
  let format: "html" | "json" = "html";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--in" && next) {
      inputDir = next;
      i += 1;
    } else if (arg === "--out" && next) {
      outPath = next;
      i += 1;
    } else if (arg === "--include-labeled") {
      includeLabeled = true;
    } else if (arg === "--format" && next) {
      if (next !== "html" && next !== "json") throw new Error("--format must be html or json");
      format = next;
      i += 1;
    }
  }

  return {
    inputDir: path.resolve(ROOT, inputDir),
    outPath: path.resolve(ROOT, outPath),
    includeLabeled,
    format,
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function relativeFromOut(outPath: string, assetPath: string) {
  return path.relative(path.dirname(outPath), path.resolve(ROOT, assetPath));
}

async function readPair(filePath: string): Promise<TastePairManifest | null> {
  const pair = JSON.parse(await readFile(filePath, "utf8")) as TastePairManifest;
  if (pair.schemaVersion !== 1 || !Array.isArray(pair.variants) || pair.variants.length !== 2) return null;
  return pair;
}

function toQueueItem(pair: TastePairManifest, pairPath: string, outPath: string): QueueItem {
  const relativePairPath = path.relative(ROOT, pairPath);
  const command = (preferred: "a" | "b" | "tie") =>
    `pnpm label:taste-pair -- --pair ${shellQuote(relativePairPath)} --preferred ${preferred} --confidence 0.8 --rationale ${shellQuote("TODO")}`;

  return {
    pairId: pair.pairId,
    pairPath: relativePairPath,
    sourceKind: pair.source.kind,
    label: pair.label?.preferredVariantId ?? null,
    variants: pair.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      url: variant.url,
      risk: variant.mechanicalSummary,
      screenshots: variant.artifacts.map((artifact) => ({
        viewport: artifact.viewport,
        aboveFoldPath: relativeFromOut(outPath, artifact.aboveFoldPath),
        fullPagePath: relativeFromOut(outPath, artifact.fullPagePath),
      })),
    })),
    labelCommands: {
      a: command("a"),
      b: command("b"),
      tie: command("tie"),
    },
  };
}

function renderHtml(items: QueueItem[]) {
  const cards = items
    .map((item) => {
      const variants = item.variants
        .map((variant) => {
          const shots = variant.screenshots
            .map(
              (shot) => `
                <figure>
                  <img src="${escapeHtml(shot.aboveFoldPath)}" alt="${escapeHtml(`${variant.label} ${shot.viewport} above fold`)}" />
                  <figcaption>${escapeHtml(shot.viewport)} above fold</figcaption>
                </figure>
              `,
            )
            .join("");
          return `
            <section class="variant">
              <h3>${escapeHtml(variant.id.toUpperCase())}: ${escapeHtml(variant.label)}</h3>
              <p><a href="${escapeHtml(variant.url)}">${escapeHtml(variant.url)}</a></p>
              <dl>
                <dt>risk</dt><dd>${escapeHtml(variant.risk.highestRiskLevel)} / ${variant.risk.highestRiskScore}</dd>
                <dt>clipped</dt><dd>${variant.risk.totalClippedTextCandidates}</dd>
                <dt>contrast</dt><dd>${variant.risk.totalLowContrastCandidates}</dd>
                <dt>failed images</dt><dd>${variant.risk.totalFailedImages}</dd>
                <dt>overflow</dt><dd>${variant.risk.maxHorizontalOverflow}</dd>
              </dl>
              <div class="shots">${shots}</div>
            </section>
          `;
        })
        .join("");
      return `
        <article class="pair">
          <header>
            <div>
              <p>${escapeHtml(item.sourceKind)} · ${escapeHtml(item.pairPath)}</p>
              <h2>${escapeHtml(item.pairId)}</h2>
            </div>
            <strong>${escapeHtml(item.label ?? "unlabeled")}</strong>
          </header>
          <div class="variants">${variants}</div>
          <div class="commands">
            <code>${escapeHtml(item.labelCommands.a)}</code>
            <code>${escapeHtml(item.labelCommands.b)}</code>
            <code>${escapeHtml(item.labelCommands.tie)}</code>
          </div>
        </article>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Taste Label Queue</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f4f2ed; color: #171717; }
    main { max-width: 1200px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { font-size: 28px; margin: 0 0 6px; }
    .summary { margin: 0 0 24px; color: #57534e; }
    .pair { background: #fff; border: 1px solid #dedbd2; border-radius: 8px; padding: 18px; margin: 18px 0; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: start; border-bottom: 1px solid #ebe7dd; padding-bottom: 12px; }
    h2 { font-size: 17px; margin: 3px 0 0; overflow-wrap: anywhere; }
    h3 { font-size: 15px; margin: 0 0 4px; }
    p { margin: 0; color: #57534e; }
    a { color: #0f766e; overflow-wrap: anywhere; }
    strong { border: 1px solid #d6d3d1; border-radius: 999px; padding: 4px 10px; font-size: 13px; }
    .variants { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 16px; }
    .variant { min-width: 0; }
    dl { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 12px 0; }
    dt { font-size: 11px; text-transform: uppercase; color: #78716c; }
    dd { margin: 0; font-weight: 650; }
    .shots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    figure { margin: 0; border: 1px solid #e7e5df; border-radius: 6px; overflow: hidden; background: #fafafa; }
    img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; }
    figcaption { font-size: 12px; color: #57534e; padding: 7px 8px; }
    .commands { display: grid; gap: 8px; margin-top: 16px; }
    code { display: block; background: #1c1917; color: #fafaf9; border-radius: 6px; padding: 10px; overflow-x: auto; font-size: 12px; }
    @media (max-width: 820px) { .variants, .shots, dl { grid-template-columns: 1fr; } header { display: block; } strong { display: inline-block; margin-top: 10px; } }
  </style>
</head>
<body>
  <main>
    <h1>Taste Label Queue</h1>
    <p class="summary">${items.length} pair(s). Pick the better website visually, then run one label command.</p>
    ${cards || "<p>No pairs matched this queue.</p>"}
  </main>
</body>
</html>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await findJsonFiles(args.inputDir);
  const items: QueueItem[] = [];

  for (const file of files) {
    const pair = await readPair(file);
    if (!pair) continue;
    if (!args.includeLabeled && pair.label) continue;
    items.push(toQueueItem(pair, file, args.outPath));
  }

  await mkdir(path.dirname(args.outPath), { recursive: true });
  if (args.format === "json") {
    await writeFile(args.outPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2)}\n`);
  } else {
    await writeFile(args.outPath, renderHtml(items));
  }

  console.log(JSON.stringify({
    output: path.relative(ROOT, args.outPath),
    format: args.format,
    pairs: items.length,
    includeLabeled: args.includeLabeled,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
