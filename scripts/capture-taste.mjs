#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1100, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 1100, deviceScaleFactor: 1, isMobile: true },
];

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
    } else {
      args.set(key, next);
      i += 1;
    }
  }
  return args;
}

function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'capture'
  );
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function summarizeMechanicalRisk(metrics) {
  const reasons = [];
  let score = 0;

  if (metrics.page.overflowX > 2) {
    score += 25;
    reasons.push(`horizontal overflow ${Math.round(metrics.page.overflowX)}px`);
  }

  if (metrics.issues.clippedText.length > 0) {
    score += Math.min(25, metrics.issues.clippedText.length * 5);
    reasons.push(`${metrics.issues.clippedText.length} clipped text candidates`);
  }

  if (metrics.issues.lowContrastText.length > 0) {
    score += Math.min(20, metrics.issues.lowContrastText.length * 3);
    reasons.push(`${metrics.issues.lowContrastText.length} low contrast candidates`);
  }

  if (metrics.issues.tinyText.length > 0) {
    score += Math.min(10, metrics.issues.tinyText.length * 2);
    reasons.push(`${metrics.issues.tinyText.length} tiny text candidates`);
  }

  if (metrics.page.firstSectionHeightRatio != null && metrics.page.firstSectionHeightRatio > 1.25) {
    score += 10;
    reasons.push(
      `first section is ${metrics.page.firstSectionHeightRatio.toFixed(1)}x viewport height`
    );
  }

  if (metrics.page.visibleActionCount === 0) {
    score += 10;
    reasons.push('no visible above-fold action');
  }

  if (metrics.page.failedImageCount > 0) {
    score += Math.min(10, metrics.page.failedImageCount * 5);
    reasons.push(`${metrics.page.failedImageCount} failed images`);
  }

  const bounded = Math.min(100, Math.round(score));
  return {
    score: bounded,
    level: bounded >= 45 ? 'high' : bounded >= 20 ? 'medium' : 'low',
    reasons,
  };
}

async function collectMetrics(page, url, viewport, loadMs, capturedAt) {
  const raw = await page.evaluate(
    ({ url, viewport, loadMs, capturedAt }) => {
      const root = document.documentElement;
      const viewportWidth = root.clientWidth;
      const viewportHeight = window.innerHeight;

      const selectorFor = (el) => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const tag = el.tagName.toLowerCase();
        const cls = [...el.classList]
          .slice(0, 2)
          .map((c) => `.${CSS.escape(c)}`)
          .join('');
        return `${tag}${cls}`;
      };

      const rectFor = (el) => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      };

      const visible = (el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          Number(s.opacity || '1') > 0.01 &&
          r.width > 0 &&
          r.height > 0 &&
          r.bottom >= 0 &&
          r.top <= viewportHeight
        );
      };

      const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

      const parseRgb = (value) => {
        const m = value.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1].split(',').map((p) => Number.parseFloat(p.trim()));
        const alpha = parts.length === 4 ? parts[3] : 1;
        if (parts.length < 3 || alpha === 0) return null;
        return [parts[0], parts[1], parts[2]];
      };

      const luminance = ([r, g, b]) => {
        const convert = (v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
      };

      const contrast = (fg, bg) => {
        const l1 = luminance(fg);
        const l2 = luminance(bg);
        const light = Math.max(l1, l2);
        const dark = Math.min(l1, l2);
        return (light + 0.05) / (dark + 0.05);
      };

      const backgroundFor = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
          const bg = parseRgb(getComputedStyle(node).backgroundColor);
          if (bg) return bg;
          node = node.parentElement;
        }
        return parseRgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
      };

      const elements = [...document.body.querySelectorAll('*')].filter(visible);
      const textElements = elements.filter((el) => textOf(el).length > 0);

      const horizontalOverflow = elements
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < -2 || r.right > viewportWidth + 2;
        })
        .slice(0, 20)
        .map((el) => ({
          selector: selectorFor(el),
          text: textOf(el).slice(0, 90),
          rect: rectFor(el),
          detail: 'Visible element crosses viewport boundary',
        }));

      const clippedText = textElements
        .filter(
          (el) => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2
        )
        .slice(0, 20)
        .map((el) => ({
          selector: selectorFor(el),
          text: textOf(el).slice(0, 90),
          rect: rectFor(el),
          detail: `scroll ${el.scrollWidth}x${el.scrollHeight}, client ${el.clientWidth}x${el.clientHeight}`,
        }));

      const lowContrastText = textElements
        .map((el) => {
          const style = getComputedStyle(el);
          const color = parseRgb(style.color);
          if (!color) return null;
          const ratio = contrast(color, backgroundFor(el));
          const fontSize = Number.parseFloat(style.fontSize || '16');
          const largeText =
            fontSize >= 18 ||
            (fontSize >= 14 && Number.parseFloat(style.fontWeight || '400') >= 600);
          const threshold = largeText ? 3 : 4.5;
          if (ratio >= threshold) return null;
          return {
            selector: selectorFor(el),
            text: textOf(el).slice(0, 90),
            rect: rectFor(el),
            detail: `contrast ${ratio.toFixed(2)} below ${threshold}`,
          };
        })
        .filter(Boolean)
        .slice(0, 20);

      const tinyText = textElements
        .filter((el) => Number.parseFloat(getComputedStyle(el).fontSize || '16') < 11)
        .slice(0, 20)
        .map((el) => ({
          selector: selectorFor(el),
          text: textOf(el).slice(0, 90),
          rect: rectFor(el),
          detail: `font-size ${getComputedStyle(el).fontSize}`,
        }));

      const failedImages = [...document.images]
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .slice(0, 20)
        .map((img) => ({
          selector: selectorFor(img),
          rect: rectFor(img),
          detail: img.currentSrc || img.src || 'image failed to load',
        }));

      const aboveFoldTextChars = textElements
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top < viewportHeight && r.bottom > 0;
        })
        .reduce((total, el) => total + textOf(el).length, 0);

      const firstSection = document.querySelector('main section, section, main, body > div');
      const firstSectionHeightRatio = firstSection
        ? Number((firstSection.getBoundingClientRect().height / viewportHeight).toFixed(3))
        : null;

      const visibleHeadingCount = [
        ...document.querySelectorAll("h1,h2,h3,[role='heading']"),
      ].filter(visible).length;
      const visibleActionCount = [
        ...document.querySelectorAll("a[href],button,input[type='submit']"),
      ].filter((el) => {
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.top < viewportHeight && r.bottom > 0;
      }).length;

      return {
        url,
        finalUrl: location.href,
        viewport,
        title: document.title,
        capturedAt,
        loadMs,
        page: {
          viewportWidth,
          viewportHeight,
          scrollWidth: root.scrollWidth,
          scrollHeight: root.scrollHeight,
          overflowX: Math.max(0, root.scrollWidth - viewportWidth),
          aboveFoldTextChars,
          aboveFoldTextDensity: Number(
            (aboveFoldTextChars / (viewportWidth * viewportHeight)).toFixed(6)
          ),
          firstSectionHeightRatio,
          visibleHeadingCount,
          visibleActionCount,
          failedImageCount: failedImages.length,
        },
        issues: {
          horizontalOverflow,
          clippedText,
          lowContrastText,
          tinyText,
          failedImages,
        },
      };
    },
    { url, viewport, loadMs, capturedAt }
  );

  return { ...raw, risk: summarizeMechanicalRisk(raw) };
}

async function captureUrl({ url, label, notes, outDir }) {
  const capturedAt = new Date().toISOString();
  const browser = await chromium.launch();
  const artifacts = [];

  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: Boolean(viewport.isMobile),
      });

      const started = Date.now();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
      } catch (error) {
        if (error?.name !== 'TimeoutError') throw error;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.waitForTimeout(2_000);
      }
      const loadMs = Date.now() - started;

      const aboveFoldPath = path.join(outDir, `${viewport.name}-above-fold.png`);
      const fullPagePath = path.join(outDir, `${viewport.name}-full-page.png`);
      await page.screenshot({ path: aboveFoldPath, fullPage: false });
      await page.screenshot({ path: fullPagePath, fullPage: true });

      const metrics = await collectMetrics(page, url, viewport, loadMs, capturedAt);
      artifacts.push({
        viewport: viewport.name,
        aboveFoldPath: path.relative(outDir, aboveFoldPath),
        fullPagePath: path.relative(outDir, fullPagePath),
        metrics,
      });

      await page.close();
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    schemaVersion: 1,
    source: { url, label, notes },
    capturedAt,
    artifacts,
  };

  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

const args = parseArgs(process.argv.slice(2));
const url = args.get('url');
if (!url) {
  console.error(
    'Usage: bun capture:taste -- --url https://example.com [--label name] [--out captures/taste] [--out-dir captures/taste/example]'
  );
  process.exit(2);
}

const label = args.get('label') || slugify(url);
const notes = args.get('notes');
const baseOut = path.resolve(ROOT, args.get('out') || 'captures/taste');
const outDir = args.get('out-dir')
  ? path.resolve(ROOT, args.get('out-dir'))
  : path.join(baseOut, `${slugify(label)}-${timestamp()}`);
await mkdir(outDir, { recursive: true });

const manifest = await captureUrl({ url, label, notes, outDir });
const risks = manifest.artifacts
  .map((a) => `${a.viewport}:${a.metrics.risk.level}/${a.metrics.risk.score}`)
  .join(', ');
console.log(`Captured ${url}`);
console.log(`Output: ${path.relative(ROOT, outDir)}`);
console.log(`Mechanical risk: ${risks}`);
