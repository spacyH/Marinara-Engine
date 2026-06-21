/** Perchance text-to-image-plugin resolutions accepted by marinara.bridge. */
export const PERCHANCE_RESOLUTIONS = ["512x512", "512x768", "768x512", "768x768"];

/**
 * Map Marinara width/height to the nearest supported Perchance resolution.
 * @param {number | undefined} width
 * @param {number | undefined} height
 */
export function nearestPerchanceResolution(width = 768, height = 768) {
  const w = Number.isFinite(width) && width > 0 ? width : 768;
  const h = Number.isFinite(height) && height > 0 ? height : 768;
  const targetRatio = w / h;

  let best = PERCHANCE_RESOLUTIONS[0];
  let bestScore = Infinity;

  for (const candidate of PERCHANCE_RESOLUTIONS) {
    const [cw, ch] = candidate.split("x").map(Number);
    const ratioDelta = Math.abs(cw / ch - targetRatio);
    const sizeDelta = (Math.abs(cw - w) + Math.abs(ch - h)) / 1000;
    const score = ratioDelta + sizeDelta;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}
