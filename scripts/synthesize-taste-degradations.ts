#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CaptureIssue, MechanicalMetrics, TasteCaptureManifest } from "../src/lib/visualEvidence.ts";
import { summarizeMechanicalRisk } from "../src/lib/visualEvidence.ts";
import { summarizeCaptureArtifactRisk, type TastePairManifest } from "../src/lib/tasteDataset.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type DegradationKind = "clipped" | "contrast" | "hero" | "mobile_overflow" | "failed_image";

const DEGRADATIONS: DegradationKind[] = ["clipped", "contrast", "hero", "mobile_overflow", "failed_image"];

interface CliArgs {
  inputPath: string;
  outDir: string;
  label: string;
  count: number;
}

function parseArgs(argv: string[]): CliArgs {
  let inputPath = "";
  let outDir = "captures/taste-pairs";
  let label = "synthetic-degradation";
  let count = DEGRADATIONS.length;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--manifest" && next) {
      inputPath = next;
      i += 1;
    } else if (arg === "--out" && next) {
      outDir = next;
      i += 1;
    } else if (arg === "--label" && next) {
      label = next;
      i += 1;
    } else if (arg === "--count" && next) {
      count = Number.parseInt(next, 10);
      i += 1;
    }
  }

  if (!inputPath) {
    throw new Error("Usage: pnpm synth:taste-degrade -- --manifest captures/.../manifest.json [--out captures/taste-pairs]");
  }

  return {
    inputPath: path.resolve(ROOT, inputPath),
    outDir: path.resolve(ROOT, outDir),
    label,
    count: Math.max(1, Math.min(DEGRADATIONS.length, Number.isFinite(count) ? count : DEGRADATIONS.length)),
  };
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "synthetic-degradation"
  );
}

function syntheticIssue(type: DegradationKind, metrics: MechanicalMetrics): CaptureIssue {
  return {
    selector: `[data-synthetic-${type}]`,
    text: `Synthetic ${type} degradation`,
    rect: {
      x: 0,
      y: 0,
      width: Math.min(metrics.page.viewportWidth, 420),
      height: 48,
    },
    detail: `Synthetic degradation injected for ${type}`,
  };
}

function degradeMetrics(metrics: MechanicalMetrics, kind: DegradationKind): MechanicalMetrics {
  const next: MechanicalMetrics = JSON.parse(JSON.stringify(metrics));
  next.capturedAt = new Date().toISOString();

  if (kind === "clipped") {
    next.issues.clippedText.push(syntheticIssue(kind, next), syntheticIssue(kind, next), syntheticIssue(kind, next));
  } else if (kind === "contrast") {
    next.issues.lowContrastText.push(syntheticIssue(kind, next), syntheticIssue(kind, next), syntheticIssue(kind, next));
  } else if (kind === "hero") {
    next.page.firstSectionHeightRatio = Math.max(next.page.firstSectionHeightRatio ?? 0, 2.4);
    next.page.visibleActionCount = 0;
  } else if (kind === "mobile_overflow") {
    next.page.scrollWidth = Math.max(next.page.scrollWidth, next.page.viewportWidth + 160);
    next.page.overflowX = Math.max(next.page.overflowX, 160);
    next.issues.horizontalOverflow.push(syntheticIssue(kind, next));
  } else if (kind === "failed_image") {
    next.page.failedImageCount += 2;
    next.issues.failedImages.push(syntheticIssue(kind, next), syntheticIssue(kind, next));
  }

  next.risk = summarizeMechanicalRisk({
    ...next,
    risk: undefined as never,
  });
  return next;
}

function degradeManifest(manifest: TasteCaptureManifest, kind: DegradationKind): TasteCaptureManifest {
  const degraded: TasteCaptureManifest = {
    ...manifest,
    source: {
      ...manifest.source,
      label: `${manifest.source.label ?? "variant"}-${kind}`,
      notes: `Synthetic ${kind} degradation from ${manifest.source.url}`,
    },
    capturedAt: new Date().toISOString(),
    artifacts: manifest.artifacts.map((artifact) => ({
      ...artifact,
      metrics: degradeMetrics(artifact.metrics, kind),
    })),
  };

  return degraded;
}

function buildVariant(id: "a" | "b", manifest: TasteCaptureManifest, manifestPath: string) {
  return {
    id,
    label: manifest.source.label ?? (id === "a" ? "Original" : "Synthetic degraded"),
    url: manifest.source.url,
    captureManifestPath: path.relative(ROOT, manifestPath),
    capturedAt: manifest.capturedAt,
    artifacts: manifest.artifacts,
    mechanicalSummary: summarizeCaptureArtifactRisk(manifest.artifacts),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(args.inputPath, "utf8")) as TasteCaptureManifest;
  const createdAt = new Date().toISOString();
  const chosen = DEGRADATIONS.slice(0, args.count);
  await mkdir(args.outDir, { recursive: true });

  for (const kind of chosen) {
    const degraded = degradeManifest(manifest, kind);
    const degradedManifestPath = path.join(args.outDir, `${slugify(args.label)}-${kind}-degraded-manifest.json`);
    await writeFile(degradedManifestPath, `${JSON.stringify(degraded, null, 2)}\n`);

    const pair: TastePairManifest = {
      schemaVersion: 1,
      pairId: `${slugify(args.label)}-${kind}-${createdAt.replace(/[:.]/g, "-")}`,
      createdAt,
      source: {
        kind: "synthetic_degradation",
        notes: `Original capture preferred over synthetic ${kind} degradation.`,
      },
      context: {
        studyType: "landing_page",
        primaryObjective: "maximize_signup",
        notes: "Synthetic degradation bootstraps Taste ranker before curated labels.",
      },
      variants: [
        buildVariant("a", manifest, args.inputPath),
        buildVariant("b", degraded, degradedManifestPath),
      ],
      label: {
        preferredVariantId: "a",
        confidence: 0.95,
        rationale: `Variant B has synthetic ${kind} visual failures.`,
        criterionPreferences: {
          readability: kind === "clipped" || kind === "contrast" ? "a" : undefined,
          mobileFit: kind === "mobile_overflow" ? "a" : undefined,
          conversionClarity: kind === "hero" ? "a" : undefined,
          visualPolish: "a",
        },
        annotator: "synthetic-degradation-generator",
        labeledAt: createdAt,
      },
    };

    const pairPath = path.join(args.outDir, `${pair.pairId}.json`);
    await writeFile(pairPath, `${JSON.stringify(pair, null, 2)}\n`);
    console.log(`Created ${path.relative(ROOT, pairPath)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
