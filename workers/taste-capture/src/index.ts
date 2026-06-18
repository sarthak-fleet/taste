import puppeteer from "@cloudflare/puppeteer";
import type { CaptureArtifact, CaptureIssue, CaptureViewport, MechanicalMetrics, TasteCaptureManifest } from "../../../src/lib/visualEvidence";

interface Env {
  BROWSER: Fetcher;
  CAPTURES: R2Bucket;
  TASTE_API_BASE?: string;
  CAPTURE_WORKER_TOKEN?: string;
  TASTE_API_TOKEN?: string;
}

interface CaptureRequest {
  studyId?: string;
  callbackApiBase?: string;
  runBaseline?: boolean;
  captures: Array<{
    variantId?: string;
    variantLabel?: string;
    url: string;
    label?: string;
    notes?: string;
  }>;
}

interface CaptureResponse {
  captured: Array<{
    variantId?: string;
    variantLabel?: string;
    manifest: TasteCaptureManifest;
  }>;
  callback?: unknown;
}

interface ErrorPayload {
  error?: string;
}

const VIEWPORTS: CaptureViewport[] = [
  { name: "desktop", width: 1440, height: 1100, deviceScaleFactor: 1 },
  { name: "mobile", width: 390, height: 1100, deviceScaleFactor: 1, isMobile: true },
];

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "capture"
  );
}

function assertAuthorized(request: Request, env: Env) {
  if (!env.CAPTURE_WORKER_TOKEN) return;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== env.CAPTURE_WORKER_TOKEN) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
}

function summarizeMechanicalRisk(metrics: Omit<MechanicalMetrics, "risk">): MechanicalMetrics["risk"] {
  const reasons: string[] = [];
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
    reasons.push(`first section is ${metrics.page.firstSectionHeightRatio.toFixed(1)}x viewport height`);
  }
  if (metrics.page.visibleActionCount === 0) {
    score += 10;
    reasons.push("no visible above-fold action");
  }
  if (metrics.page.failedImageCount > 0) {
    score += Math.min(10, metrics.page.failedImageCount * 5);
    reasons.push(`${metrics.page.failedImageCount} failed images`);
  }

  const bounded = Math.min(100, Math.round(score));
  return {
    score: bounded,
    level: bounded >= 45 ? "high" : bounded >= 20 ? "medium" : "low",
    reasons,
  };
}

async function collectMetrics(page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>["newPage"]>>, url: string, viewport: CaptureViewport, loadMs: number, capturedAt: string) {
  const raw = await page.evaluate(
    ({ url, viewport, loadMs, capturedAt }) => {
      const root = document.documentElement;
      const viewportWidth = root.clientWidth;
      const viewportHeight = window.innerHeight;

      const selectorFor = (el: Element) => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const tag = el.tagName.toLowerCase();
        const cls = [...el.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join("");
        return `${tag}${cls}`;
      };

      const rectFor = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      };

      const visible = (el: Element) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          s.display !== "none" &&
          s.visibility !== "hidden" &&
          Number(s.opacity || "1") > 0.01 &&
          r.width > 0 &&
          r.height > 0 &&
          r.bottom >= 0 &&
          r.top <= viewportHeight
        );
      };

      const textOf = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();

      const parseRgb = (value: string): [number, number, number] | null => {
        const m = value.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1].split(",").map((p) => Number.parseFloat(p.trim()));
        const alpha = parts.length === 4 ? parts[3] : 1;
        if (parts.length < 3 || alpha === 0) return null;
        return [parts[0], parts[1], parts[2]];
      };

      const luminance = ([r, g, b]: [number, number, number]) => {
        const convert = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
      };

      const contrast = (fg: [number, number, number], bg: [number, number, number]) => {
        const l1 = luminance(fg);
        const l2 = luminance(bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };

      const backgroundFor = (el: Element) => {
        let node: Element | null = el;
        while (node && node !== document.documentElement) {
          const bg = parseRgb(getComputedStyle(node).backgroundColor);
          if (bg) return bg;
          node = node.parentElement;
        }
        return parseRgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
      };

      const elements = [...document.body.querySelectorAll("*")].filter(visible);
      const textElements = elements.filter((el) => textOf(el).length > 0);

      const toIssue = (el: Element, detail: string): CaptureIssue => ({
        selector: selectorFor(el),
        text: textOf(el).slice(0, 90),
        rect: rectFor(el),
        detail,
      });

      const horizontalOverflow = elements
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < -2 || r.right > viewportWidth + 2;
        })
        .slice(0, 20)
        .map((el) => toIssue(el, "Visible element crosses viewport boundary"));

      const clippedText = textElements
        .filter((el) => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)
        .slice(0, 20)
        .map((el) => toIssue(el, `scroll ${el.scrollWidth}x${el.scrollHeight}, client ${el.clientWidth}x${el.clientHeight}`));

      const lowContrastText = textElements
        .map((el) => {
          const style = getComputedStyle(el);
          const color = parseRgb(style.color);
          if (!color) return null;
          const ratio = contrast(color, backgroundFor(el));
          const fontSize = Number.parseFloat(style.fontSize || "16");
          const largeText = fontSize >= 18 || (fontSize >= 14 && Number.parseFloat(style.fontWeight || "400") >= 600);
          const threshold = largeText ? 3 : 4.5;
          if (ratio >= threshold) return null;
          return toIssue(el, `contrast ${ratio.toFixed(2)} below ${threshold}`);
        })
        .filter((issue): issue is CaptureIssue => issue != null)
        .slice(0, 20);

      const tinyText = textElements
        .filter((el) => Number.parseFloat(getComputedStyle(el).fontSize || "16") < 11)
        .slice(0, 20)
        .map((el) => toIssue(el, `font-size ${getComputedStyle(el).fontSize}`));

      const failedImages = [...document.images]
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .slice(0, 20)
        .map((img) => ({
          selector: selectorFor(img),
          rect: rectFor(img),
          detail: img.currentSrc || img.src || "image failed to load",
        }));

      const aboveFoldTextChars = textElements
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top < viewportHeight && r.bottom > 0;
        })
        .reduce((total, el) => total + textOf(el).length, 0);

      const firstSection = document.querySelector("main section, section, main, body > div");
      const firstSectionHeightRatio = firstSection
        ? Number((firstSection.getBoundingClientRect().height / viewportHeight).toFixed(3))
        : null;

      const visibleHeadingCount = [...document.querySelectorAll("h1,h2,h3,[role='heading']")].filter(visible).length;
      const visibleActionCount = [...document.querySelectorAll("a[href],button,input[type='submit']")].filter((el) => {
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
          aboveFoldTextDensity: Number((aboveFoldTextChars / (viewportWidth * viewportHeight)).toFixed(6)),
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
    { url, viewport, loadMs, capturedAt },
  );

  return { ...raw, risk: summarizeMechanicalRisk(raw) };
}

async function putScreenshot(bucket: R2Bucket, key: string, bytes: Uint8Array) {
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: "image/png" },
  });
}

async function captureOne(env: Env, browser: Awaited<ReturnType<typeof puppeteer.launch>>, item: CaptureRequest["captures"][number]) {
  const capturedAt = new Date().toISOString();
  const label = item.label || item.variantLabel || item.variantId || slugify(item.url);
  const baseKey = `taste/${slugify(label)}/${capturedAt.replace(/[:.]/g, "-")}`;
  const artifacts: CaptureArtifact[] = [];

  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: Boolean(viewport.isMobile),
    });

    const started = Date.now();
    await page.goto(item.url, { waitUntil: "networkidle0", timeout: 45_000 });
    const loadMs = Date.now() - started;
    const metrics = await collectMetrics(page, item.url, viewport, loadMs, capturedAt);

    const aboveFoldKey = `${baseKey}/${viewport.name}-above-fold.png`;
    const fullPageKey = `${baseKey}/${viewport.name}-full-page.png`;
    await putScreenshot(env.CAPTURES, aboveFoldKey, await page.screenshot({ fullPage: false }));
    await putScreenshot(env.CAPTURES, fullPageKey, await page.screenshot({ fullPage: true }));
    await page.close();

    artifacts.push({
      viewport: viewport.name,
      aboveFoldPath: `r2://${aboveFoldKey}`,
      fullPagePath: `r2://${fullPageKey}`,
      metrics,
    });
  }

  const manifest: TasteCaptureManifest = {
    schemaVersion: 1,
    source: {
      url: item.url,
      label,
      notes: item.notes,
    },
    capturedAt,
    artifacts,
  };

  await env.CAPTURES.put(`${baseKey}/manifest.json`, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  return {
    variantId: item.variantId,
    variantLabel: item.variantLabel,
    manifest,
  };
}

async function postCallback(env: Env, request: CaptureRequest, captured: CaptureResponse["captured"]) {
  if (!request.studyId) return undefined;
  const apiBase = (request.callbackApiBase || env.TASTE_API_BASE)?.replace(/\/$/, "");
  if (!apiBase) return undefined;

  const response = await fetch(`${apiBase}/studies/${request.studyId}/visual-evidence`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.TASTE_API_TOKEN ? { authorization: `Bearer ${env.TASTE_API_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      captures: captured,
      runBaseline: request.runBaseline ?? true,
    }),
  });

  const payload = (await response.json().catch(() => null)) as ErrorPayload | unknown;
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload ? (payload as ErrorPayload).error : undefined;
    throw new Error(message ?? `Callback failed with ${response.status}`);
  }
  return payload;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      assertAuthorized(request, env);
      if (request.method !== "POST") return json({ error: "POST required" }, { status: 405 });

      const body = (await request.json()) as CaptureRequest;
      if (!Array.isArray(body.captures) || body.captures.length === 0) {
        return json({ error: "captures are required" }, { status: 400 });
      }
      if (body.captures.length > 5) {
        return json({ error: "At most 5 captures per request" }, { status: 400 });
      }

      const browser = await puppeteer.launch(env.BROWSER);
      try {
        const captured = [];
        for (const item of body.captures) {
          if (!item.url) return json({ error: "Each capture needs a url" }, { status: 400 });
          captured.push(await captureOne(env, browser, item));
        }

        const callback = await postCallback(env, body, captured);
        return json({ captured, callback } satisfies CaptureResponse);
      } finally {
        await browser.close();
      }
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: error instanceof Error ? error.message : "Capture failed" }, { status: 500 });
    }
  },
};
