# Image Sidecar Example

This folder shows a minimal **Custom HTTP** image sidecar compatible with Marinara's `imageService: "http"` connection type.

Marinara POSTs JSON to your endpoint and expects an image back — the same contract used by illustrator flows, gallery saves, and game asset generation.

## Quick start

```bash
node docs/examples/image-sidecar/server.js
```

Then in Marinara:

1. **Settings → Connections → Add** an **Image generation** connection.
2. Service: **Custom HTTP**
3. Base URL: `http://127.0.0.1:3456/generate` (include the full path)
4. Set `IMAGE_LOCAL_URLS_ENABLED=true` in your server `.env` if localhost calls are blocked.

## Request contract

`POST /generate`

```json
{
  "prompt": "a cat in a hat",
  "negativePrompt": "",
  "width": 1024,
  "height": 1024,
  "seed": 42,
  "model": "optional-site-specific-model-id",
  "referenceImages": ["<base64>", "..."]
}
```

Optional header when the connection has an API key configured:

```http
Authorization: Bearer <api-key>
```

## Response contract

Return either inline bytes:

```json
{ "base64": "<bytes>", "mimeType": "image/png" }
```

or a fetchable URL (Marinara downloads it):

```json
{ "url": "https://example.com/tmp/image.png" }
```

## Production sidecars

| Sidecar | Path | Description |
|---------|------|-------------|
| Stub | `server.js` | Placeholder PNG — verifies Marinara HTTP wiring |
| **Perchance** | [`perchance/`](perchance/) | Playwright driver for `marinara-t2i-host` via [`marinara-bridge`](../../../../perchance-generators/marinara-bridge/) |

Real sidecars should:

- Run Playwright/Puppeteer (or site-specific automation) outside Marinara core
- Maintain selectors and login steps per target site
- Time out gracefully and return structured errors
- Document ToS, captcha, and auth caveats in your sidecar README

See also:

- [Web UI Image Generators proposal](../../feature-proposals/04-web-ui-image-generators.md)
- [Design spec](../../superpowers/specs/2026-06-20-web-ui-image-generators-design.md)

## Track A alternative (custom tool webhook)

You can invoke the same sidecar from a custom tool webhook without this core adapter:

1. Create a custom tool with webhook URL `http://localhost:3456/generate`
2. Set `WEBHOOK_LOCAL_URLS_ENABLED=true`

Track A does not automatically save images to the gallery unless you add glue; the **Custom HTTP** image connection (Track B) uses the normal `generateImage()` storage path.
