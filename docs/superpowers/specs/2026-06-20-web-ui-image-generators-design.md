# Web UI Image Generators — Design Spec

**Status:** Draft  
**Branch:** `spacyh/feat/04-web-ui-image-gen`  
**Proposal:** [docs/feature-proposals/04-web-ui-image-generators.md](../../feature-proposals/04-web-ui-image-generators.md)

## Summary

Support image generation through user-maintained HTTP sidecars (e.g. Playwright scripts targeting UI-only services) without baking site-specific automation into Marinara core. Two delivery tracks: **Track A** works today via custom tool webhooks; **Track B** adds a generic `imageService: "http"` connection adapter for first-class image connection UX.

## Goals

- Configure an image connection that POSTs to a user-run proxy and receives an image back
- Store results like any other generated image (gallery, illustrator agent)
- Keep per-site Playwright/automation logic **outside** core in a sidecar repo or user scripts
- Pluggable pattern — one maintained adapter per site, not one generic “any website” integration

## Non-Goals (v1)

- Playwright/Puppeteer bundled in Marinara server
- Browser extension tab bridge (`BroadcastChannel` / `postMessage`)
- Official adapters for specific UI-only sites in core
- Captcha solving, auth flows, or anti-bot evasion

## Current State

Image generation is API-oriented only. Supported backends in `image-generation.ts`: OpenAI, Stability, Pollinations, ComfyUI, A1111, NovelAI, Horde, RunPod ComfyUI, etc. — all assume a known API shape.

**Existing extension point (works today):**

- Custom tools with `executionType: "webhook"` (`tool-executor.ts`)
- Illustrator agent can invoke tools; webhook POSTs `{ tool, arguments }` to user URL
- Enable `WEBHOOK_LOCAL_URLS_ENABLED` for localhost sidecars

## Architecture

```text
Track A (no core):
  Playwright sidecar (:3456)
    ← custom tool webhook ← agent/tool call

Track B (core PR):
  Settings → Image connection (service: "http")
    → generateImage() POST to connection.baseUrl
    ← { base64, mimeType } or { url }
    → saveImageToDisk() (existing)
```

Per-site automation lives in a **separate sidecar repo** (e.g. `marinara-image-sidecars/`), not in Marinara core.

## Track A — Custom Tool + Sidecar (ship immediately)

No core code changes. Document as `docs/examples/image-sidecar/`.

### Sidecar contract

**Endpoint:** `POST /generate`

**Request:**

```json
{
  "prompt": "a cat in a hat",
  "negativePrompt": "",
  "width": 1024,
  "height": 1024,
  "seed": 42,
  "model": "optional-site-specific-model-id"
}
```

**Response:**

```json
{
  "base64": "<base64-encoded image bytes>",
  "mimeType": "image/png"
}
```

Or return a fetchable URL (sidecar responsibility to return base64 if Marinara custom tool expects it):

```json
{
  "url": "https://example.com/tmp/image.png"
}
```

### Marinara wiring

1. Run sidecar locally (e.g. `localhost:3456`)
2. Create custom tool: webhook URL `http://localhost:3456/generate`
3. Set `WEBHOOK_LOCAL_URLS_ENABLED=true` in server env
4. Invoke from illustrator flow or manual tool call

### Sidecar README contents

- Minimal Express/Fastify + Playwright example
- Note: DOM selectors break when sites change; user maintains per-site scripts
- ToS / auth / captcha caveats

## Track B — Core `imageService: "http"` Adapter

### 1. Connection type

Add `"http"` to image service options in:

- `packages/shared/src/constants/model-lists.ts` (`IMAGE_GENERATION_SOURCES`)
- `packages/shared/src/types/connection.ts`
- `packages/client/src/components/connections/ConnectionEditor.tsx` — label: “Custom HTTP”, fields: `baseUrl` only (API key optional/unused)

### 2. `generateImage()` case

In `packages/server/src/services/image/image-generation.ts`:

```ts
case "http":
  return generateHttpAdapter(normalizedBaseUrl, scopedRequest);
```

**`generateHttpAdapter` behavior:**

- `POST` to `baseUrl` (append `/generate` if baseUrl has no path, or POST to baseUrl directly — pick one and document)
- Body: `{ prompt, negativePrompt, width, height, seed, model, ... }` from `ImageGenRequest`
- Headers: `Content-Type: application/json`; optional `Authorization: Bearer ${apiKey}` if apiKey set
- Parse response:
  - `{ base64, mimeType }` → return `ImageGenResult`
  - `{ url }` → `safeFetch` url, convert to base64 (with size limit)
- Timeout: 120s default (image gen can be slow)
- Max response: 10 MiB image payload
- `safeFetch` policy: respect `allowLocalUrls` for localhost sidecars (same as other image backends)

### 3. Illustrator / gallery integration

No changes needed — existing `generateImage()` call path in `generate.routes.ts` and `game-asset-generation.ts` works once connection is configured.

## Key Files

| Area | File |
|------|------|
| Image generation | `packages/server/src/services/image/image-generation.ts` |
| Connection types | `packages/shared/src/constants/model-lists.ts` |
| Connection UI | `packages/client/src/components/connections/ConnectionEditor.tsx` |
| Custom tool (Track A) | `packages/server/src/services/tools/tool-executor.ts` (no changes) |
| Sidecar example | `docs/examples/image-sidecar/README.md` + minimal `server.js` |
| Env | `.env.example` — document `WEBHOOK_LOCAL_URLS_ENABLED` for Track A |

## Testing

- Unit: `generateHttpAdapter` parses base64 and url responses; rejects oversized payloads
- Unit: timeout and connection error messages
- Integration: image connection with mock HTTP server returns saved gallery image
- Manual: Track A custom tool → local Playwright sidecar

## PR Boundary

**Track A (docs-only PR or part of fork docs):** sidecar README + example script. No core changes.

**Track B (upstream PR):** `http` image service adapter + connection UI + tests.

**Outside repo:** per-site Playwright scripts in user-maintained sidecar repo.

## Recommended Rollout

1. Ship Track A docs on fork immediately — usable without upstream merge
2. Open Track B upstream PR when ready — improves connection UX
3. Do not bundle Playwright in Marinara

## Open Questions

- **URL path convention:** POST to `baseUrl` exactly as entered, or always append `/generate`? **Recommendation:** POST to `baseUrl` as entered; document that users should include full path (e.g. `http://localhost:3456/generate`).
