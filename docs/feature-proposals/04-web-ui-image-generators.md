# Web UI Image Generators (No Public API)

## Motivation

Many image services are only usable through a web UI — no stable public API, or API access gated behind tiers Marinara doesn’t integrate. Users still want to try those models from chat/game flows (illustrator agent, avatars, scene art) without leaving their Marinara workflow.

## Ideal Outcome

Configure an image “connection” that targets a UI-only service: Marinara sends prompt + parameters (and optional reference images), receives an image back, stores it like any other generated asset through `generateImage()` → gallery → message attachments. Ideally pluggable (user-provided adapter) rather than one-off hacks per site.

## Current State

Image generation is **API-oriented only**.

Supported backends (Settings → Connections → Image generation) include OpenAI, Stability, Together, NovelAI, OpenRouter, xAI, Pollinations, Horde, AUTOMATIC1111/Forge, ComfyUI, RunPod ComfyUI, Draw Things, NanoGPT, Block Entropy, and similar. All assume a **URL + known API shape**, not driving a website in a browser tab.

The in-app **Browser** panel imports characters from sites like CharTavern — it does **not** automate arbitrary image UIs.

Marinara’s core `ImageGenRequest` already supports `referenceImage` / `referenceImages` for several API backends (ComfyUI, A1111, NovelAI V4, OpenRouter multimodal, etc.), but there is no built-in path to send those refs into an arbitrary web UI.

## Implementation Overview

**Feasibility:** No generic built-in support today. New integration per site, or a user-run automation layer.

| Approach | Feasibility | Fragility |
|----------|-------------|-----------|
| **(a) Playwright/Puppeteer HTTP sidecar** + Marinara `imageService: "http"` or custom tool webhook | **Recommended** | Medium — DOM changes, auth, captcha, ToS |
| **(b) Browser extension** coordinating Marinara tab ↔ generator tab | Possible | High — permissions, anti-bot, no shared API |
| **(c) Client tab bridge** (`postMessage` / `BroadcastChannel`) | Demo / prototype only | Very high — embed restrictions, site-specific |
| **(d) Use an API or local backend** (ComfyUI, A1111, Pollinations, etc.) | Best when available | Low |

### Recommended path: Playwright HTTP sidecar

Keep per-site browser automation **outside** Marinara core. Run a small local service (e.g. Express/Fastify on `localhost:3456`) that:

1. Accepts a **stable JSON contract** from Marinara.
2. Uses **Playwright** (or Puppeteer) to drive the target site’s UI: fill prompt, set size/seed, upload reference images if the UI supports it, wait for output, capture bytes.
3. Returns `{ base64, mimeType }` or `{ url }` for Marinara to ingest.

Wire the sidecar into Marinara in one of two ways:

| Track | Core changes | UX | Storage path |
|-------|--------------|-----|--------------|
| **Track A** — custom tool webhook | None | Agent invokes webhook; result is tool text unless you add glue | Does **not** auto-save to gallery/chat unless extra logic is added |
| **Track B** — `imageService: "http"` connection | Add `http` adapter in `image-generation.ts` + connection UI | First-class image connection in Settings | Same as Pollinations/Comfy: `generateImage()` → `saveImageToDisk()` → gallery / illustrator / attachments |

**Track B is the right target** when the goal is “stores it like any other generated asset.” Track A is useful for experimentation or agent-driven flows before a core adapter lands.

Detailed design: [docs/superpowers/specs/2026-06-20-web-ui-image-generators-design.md](../superpowers/specs/2026-06-20-web-ui-image-generators-design.md).

#### Sidecar request contract (proposed)

```json
POST /generate
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

Response:

```json
{ "base64": "<bytes>", "mimeType": "image/png" }
```

or `{ "url": "https://…" }` (sidecar or adapter fetches and converts).

Enable localhost webhooks with `WEBHOOK_LOCAL_URLS_ENABLED=true` for Track A. Track B should respect the same `allowLocalUrls` policy as other image backends.

#### Playwright sidecar responsibilities (per site)

- Maintain selectors and login/session steps for **one** UI-only generator.
- Map Marinara’s `referenceImages` into whatever the site offers (img2img upload, reference slot, etc.) — not all UIs support this.
- Time out gracefully (image gen can take minutes); return structured errors Marinara can surface in connection test / illustrator flows.
- Document ToS, captcha, and auth caveats in the sidecar README — Marinara core should not solve anti-bot.

### Example existing web UI: `marinara-bridge` (Perchance)

A working **prototype** for driving a web-only generator lives in the sibling repo  
`perchance-generators/marinara-bridge` (on disk next to this repo: `../perchance-generators/marinara-bridge/`).

It is **not** a Playwright sidecar itself; it implements approach **(c)** — a `postMessage` RPC between a parent frame and a Perchance generator iframe (`?marinara=1`):

| Piece | Role |
|-------|------|
| `marinara-bridge-dsl.txt` | Sandbox plugin: listens on channel `marinara.bridge`, runs `text-to-image-plugin`, returns `dataUrl` |
| `marinara-bridge-client.js` | Parent-frame client (`generateImage({ prompt, resolution, … })`) |
| `bridge-console-snippet.js` | DevTools tester on `perchance.org` (cross-origin embed is blocked) |

**How it relates to the Playwright recommendation:** a Playwright sidecar can treat Perchance (or any site with a similar bridge) as the “web UI” layer:

```text
Marinara  →  POST /generate  →  Playwright sidecar
                                    → open perchance.org/…?marinara=1
                                    → inject marinara-bridge-client (or drive DOM directly)
                                    → receive dataUrl / PNG
                                    ← { base64, mimeType }
```

That wraps the demo-grade `postMessage` bridge in the **recommended HTTP adapter** shape so Track B applies unchanged. Perchance-specific quirks (serial queue, visible broker iframe, `X-Frame-Options`) stay in the sidecar/bridge repo, not in Marinara core.

**Gaps vs ideal:** bridge protocol today has no `referenceImages`; extending the contract is sidecar/bridge work. Marinara only needs to forward refs once the HTTP adapter exists.

### Approaches not recommended for core (v1)

- **Bundling Playwright in Marinara server** — heavy deps, headless browser ops don’t belong in the engine process.
- **Official in-repo adapters per UI-only site** — high maintenance; user-maintained sidecars scale better.
- **Native `postMessage` panel in Marinara client** — fragile (embed policies, per-origin); use HTTP sidecar instead.

## Verdict

- **Lowest friction today:** Pollinations, local ComfyUI, or A1111 when an API exists.
- **Best path for UI-only sites:** user-run **Playwright HTTP sidecar** + Marinara **`imageService: "http"`** (Track B) so illustrator, game assets, and gallery flows reuse existing storage.
- **Track A** (custom tool webhook) works without core changes but does not automatically match built-in image storage unless wired manually.
- **`marinara-bridge`** is a concrete reference for automating one web UI (Perchance t2i); wrap it in a sidecar rather than integrating `postMessage` into Marinara core.
