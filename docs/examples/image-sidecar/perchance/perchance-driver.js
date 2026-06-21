import { chromium } from "playwright";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseDataUrl } from "./data-url.js";
import { nearestPerchanceResolution } from "./resolution.js";

const DEFAULT_GENERATOR_URL = "https://perchance.org/marinara-t2i-host?marinara=1";
const DEFAULT_TIMEOUT_MS = Number(process.env.PERCHANCE_GEN_TIMEOUT_MS ?? 180_000);
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const DEFAULT_USER_DATA_DIR = join(homedir(), ".marinara-perchance-chrome");

/** @type {Promise<import('playwright').Browser> | null} */
let browserPromise = null;
/** @type {Promise<import('playwright').BrowserContext> | null} */
let persistentContextPromise = null;
/** @type {Promise<import('playwright').Browser> | null} */
let cdpBrowserPromise = null;

function cdpEndpoint() {
  return process.env.PLAYWRIGHT_CDP_URL?.trim() || null;
}

function generatorUrl() {
  return process.env.PERCHANCE_GENERATOR_URL?.trim() || DEFAULT_GENERATOR_URL;
}

function generatorSlugFromUrl(url) {
  try {
    const slug = new URL(url).pathname.replace(/^\//, "").split("/")[0];
    return slug || "marinara-t2i-host";
  } catch {
    return "marinara-t2i-host";
  }
}

function userDataDir() {
  const configured = process.env.PLAYWRIGHT_USER_DATA_DIR?.trim();
  if (configured === "0" || configured?.toLowerCase() === "false") return null;
  return configured || DEFAULT_USER_DATA_DIR;
}

function playwrightUserAgent() {
  return process.env.PLAYWRIGHT_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

function launchOptions() {
  /** @type {import('playwright').LaunchOptions} */
  const options = {
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    ignoreDefaultArgs: ["--enable-automation"],
  };
  const channel = process.env.PLAYWRIGHT_CHANNEL?.trim();
  if (channel) options.channel = channel;
  return options;
}

function contextOptions() {
  return {
    userAgent: playwrightUserAgent(),
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    timezoneId: process.env.PLAYWRIGHT_TIMEZONE?.trim() || "America/New_York",
  };
}

async function addStealthInitScript(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
}

async function getEphemeralContext() {
  if (!browserPromise) {
    browserPromise = chromium.launch(launchOptions());
  }
  const browser = await browserPromise;
  const context = await browser.newContext(contextOptions());
  await addStealthInitScript(context);
  return { context, persistent: false, cdp: false };
}

async function getCdpContext() {
  const endpoint = cdpEndpoint();
  if (!endpoint) return null;

  if (!cdpBrowserPromise) {
    cdpBrowserPromise = chromium.connectOverCDP(endpoint);
  }
  const browser = await cdpBrowserPromise;
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error(
      `No browser context on ${endpoint} — start Chrome with --remote-debugging-port and keep one window open`,
    );
  }
  return { context, persistent: true, cdp: true };
}

async function getPersistentContext() {
  const cdp = await getCdpContext();
  if (cdp) return cdp;

  const dir = userDataDir();
  if (!dir) return getEphemeralContext();

  if (!persistentContextPromise) {
    persistentContextPromise = (async () => {
      const context = await chromium.launchPersistentContext(dir, {
        ...launchOptions(),
        ...contextOptions(),
      });
      await addStealthInitScript(context);
      return context;
    })();
  }
  const context = await persistentContextPromise;
  return { context, persistent: true, cdp: false };
}

/**
 * Drop the shared Playwright browser/context so the next job starts clean.
 */
export async function resetPlaywrightSession() {
  await disposePlaywrightSession();
}

async function disposePlaywrightSession() {
  if (cdpBrowserPromise) {
    const browser = await cdpBrowserPromise;
    cdpBrowserPromise = null;
    await browser.close().catch(() => {});
  }
  if (persistentContextPromise) {
    const context = await persistentContextPromise;
    persistentContextPromise = null;
    await context.close().catch(() => {});
  }
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close().catch(() => {});
  }
}

async function openJobPage() {
  const session = await getPersistentContext();
  const page = await session.context.newPage();
  return { page, ...session };
}

/**
 * Perchance runs generator code in a sandbox iframe (*.perchance.org), not the
 * top-level perchance.org shell where Playwright lands after goto().
 *
 * @param {import('playwright').Page} page
 * @param {string} generatorSlug
 * @param {number} timeoutMs
 */
async function waitForGeneratorFrame(page, generatorSlug, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      let frameUrl = "";
      try {
        frameUrl = frame.url();
      } catch {
        continue;
      }
      if (!frameUrl.includes(".perchance.org/")) continue;
      if (!frameUrl.includes(`/${generatorSlug}`)) continue;
      if (frameUrl.startsWith("https://perchance.org/")) continue;

      const ready = await frame
        .evaluate(() => typeof window.marinara?.bridge?.generate === "function")
        .catch(() => false);
      if (ready) return frame;
    }
    await page.waitForTimeout(250);
  }

  const title = await page.title().catch(() => "");
  if (title.toLowerCase().includes("just a moment")) {
    throw new Error(
      "Perchance Cloudflare challenge blocked headless access — try PLAYWRIGHT_CHANNEL=chrome or a custom PLAYWRIGHT_USER_AGENT",
    );
  }
  throw new Error(
    "marinara.bridge.generate not found in generator iframe — publish marinara-t2i-host from perchance-generators/marinara-bridge/ and check PERCHANCE_GENERATOR_URL",
  );
}

/**
 * @param {string} base64
 * @param {string} [mimeType]
 */
function referenceImageFromBase64(base64, mimeType = "image/png") {
  const trimmed = base64.replace(/\s+/g, "");
  const normalizedMime = mimeType.includes("/") ? mimeType : "image/png";
  return {
    url: `data:${normalizedMime};base64,${trimmed}`,
    blur: Number(process.env.PERCHANCE_REFERENCE_BLUR ?? 0.35),
  };
}

/**
 * Map Marinara HTTP sidecar payload to marinara.bridge generate() options.
 * Protocol reference: ../perchance-generators/marinara-bridge/marinara-bridge-client.js
 *
 * @param {Record<string, unknown>} payload
 */
export function mapMarinaraRequest(payload) {
  const promptRaw = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const negativePrompt = typeof payload.negativePrompt === "string" ? payload.negativePrompt.trim() : "";
  const prompt = negativePrompt ? `${promptRaw}\n\nAvoid: ${negativePrompt}` : promptRaw;
  if (!prompt) {
    throw new Error("prompt is required");
  }

  const width = typeof payload.width === "number" ? payload.width : 768;
  const height = typeof payload.height === "number" ? payload.height : 768;
  const seed = typeof payload.seed === "number" ? payload.seed : -1;

  const bridgePayload = {
    prompt,
    resolution: nearestPerchanceResolution(width, height),
    guidanceScale: Number(process.env.PERCHANCE_GUIDANCE_SCALE ?? 7),
    seed,
  };

  const refs = Array.isArray(payload.referenceImages)
    ? payload.referenceImages.filter((ref) => typeof ref === "string" && ref.trim())
    : typeof payload.referenceImage === "string" && payload.referenceImage.trim()
      ? [payload.referenceImage]
      : [];

  if (refs.length > 0) {
    bridgePayload.referenceImage = referenceImageFromBase64(refs[0]);
  }

  return bridgePayload;
}

/**
 * Drive the published Perchance marinara-t2i-host generator through marinara.bridge.generate().
 *
 * @param {Record<string, unknown>} payload Marinara /generate body
 */
export async function generatePerchanceImage(payload) {
  const bridgePayload = mapMarinaraRequest(payload);
  const url = generatorUrl();
  const generatorSlug = generatorSlugFromUrl(url);
  const { page, context, persistent, cdp } = await openJobPage();
  let failed = false;

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: Number(process.env.PERCHANCE_NAV_TIMEOUT_MS ?? 90_000),
    });

    const generatorFrame = await waitForGeneratorFrame(
      page,
      generatorSlug,
      Number(process.env.PERCHANCE_BRIDGE_READY_MS ?? 120_000),
    );

    const result = await Promise.race([
      generatorFrame.evaluate(async ({ opts }) => {
        const bridge = window.marinara?.bridge;
        if (!bridge || typeof bridge.generate !== "function") {
          return { ok: false, reason: "marinara.bridge.generate unavailable" };
        }
        return await bridge.generate(opts);
      }, { opts: bridgePayload }),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("marinara.bridge generate timeout")),
          DEFAULT_TIMEOUT_MS,
        );
      }),
    ]).catch((err) => ({
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    }));

    if (!result?.ok) {
      failed = true;
      const reason = result?.reason ?? "Perchance image generation failed";
      if (/anti-bot|verification failed/i.test(reason)) {
        throw new Error(
          `${reason} — Playwright-launched Chrome cannot pass Perchance Turnstile; use PLAYWRIGHT_CDP_URL to attach to your own Chrome (see README)`,
        );
      }
      throw new Error(reason);
    }

    const dataUrl = result.value?.dataUrl ?? result.value?.text;
    if (!dataUrl || !String(dataUrl).startsWith("data:")) {
      failed = true;
      throw new Error("Perchance did not return a data URL image");
    }

    return parseDataUrl(String(dataUrl));
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    await page.close().catch(() => {});
    if (!persistent) {
      await context.close().catch(() => {});
    }
    if (failed && !cdp && process.env.PLAYWRIGHT_KEEP_BROWSER_ON_FAILURE !== "true") {
      await disposePlaywrightSession();
    }
  }
}

export async function closeBrowser() {
  await disposePlaywrightSession();
}
