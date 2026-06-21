/**
 * @param {string} dataUrl
 * @returns {{ base64: string; mimeType: string; ext: string }}
 */
export function parseDataUrl(dataUrl) {
  const match = String(dataUrl).trim().match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([\s\S]+)$/i);
  if (!match) {
    throw new Error("Perchance returned an unsupported image data URL");
  }

  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const base64 = match[2].replace(/\s+/g, "");
  const ext =
    mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : mimeType.includes("gif") ? "gif" : "png";

  return { base64, mimeType, ext };
}
