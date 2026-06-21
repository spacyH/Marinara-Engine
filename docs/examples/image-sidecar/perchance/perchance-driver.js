import { chromium } from "playwright";
import { parseDataUrl } from "./data-url.js";
import { nearestPerchanceResolution } from "./resolution.js";

const DEFAULT_GENERATOR_URL = "https://perchance.org/marinara-t2i-host?marinara=1";
const DEFAULT_TIMEOUT_MS = Number(process.env.PERCHANCE_GEN_TIMEOUT_MS ?? 180_000);

/** @type {Promise<import('playwright').Browser> | null} */
let browserPromise = null;

function generatorUrl() {
  return process.env.PERCHANCE_GENERATOR_URL?.trim() || DEFAULT_GENERATOR_URL;
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    });
  }
  return browserPromise;
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
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(generatorUrl(), {
      waitUntil: "domcontentloaded",
      timeout: Number(process.env.PERCHANCE_NAV_TIMEOUT_MS ?? 90_000),
    });

    await page.waitForFunction(
      () => typeof window.marinara?.bridge?.generate === "function",
      undefined,
      { timeout: Number(process.env.PERCHANCE_BRIDGE_READY_MS ?? 120_000) },
    );

    const result = await page.evaluate(
      async ({ opts, timeoutMs }) => {
        const bridge = window.marinara?.bridge;
        if (!bridge || typeof bridge.generate !== "function") {
          return { ok: false, reason: "marinara.bridge.generate unavailable" };
        }

        return await Promise.race([
          bridge.generate(opts),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("marinara.bridge generate timeout")), timeoutMs);
          }),
        ]);
      },
      { opts: bridgePayload, timeoutMs: DEFAULT_TIMEOUT_MS },
    );

    if (!result?.ok) {
      throw new Error(result?.reason ?? "Perchance image generation failed");
    }

    const dataUrl = result.value?.dataUrl ?? result.value?.text;
    if (!dataUrl || !String(dataUrl).startsWith("data:")) {
      throw new Error("Perchance did not return a data URL image");
    }

    return parseDataUrl(String(dataUrl));
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
