# Perchance marinara-t2i-host Sidecar

Playwright HTTP sidecar that drives the **Marinara T2I Host** Perchance generator through [`marinara.bridge`](../../../../perchance-generators/marinara-bridge/).

Marinara's **Custom HTTP** image connection POSTs here; this service opens the published generator in headless Chromium, calls `window.marinara.bridge.generate()`, and returns `{ base64, mimeType }`.

## Prerequisites

- Node.js 24+
- Sibling checkout of the bridge reference repo (for protocol docs, not required at runtime):

  ```text
  Marinara-Engine/
  perchance-generators/marinara-bridge/   ← marinara-bridge-dsl.txt, marinara-t2i-host-*.txt
  ```

- A published Perchance generator based on `marinara-t2i-host-dsl.txt` (default URL below). Update `PERCHANCE_GENERATOR_URL` if you host your own copy.

## Setup

```bash
cd docs/examples/image-sidecar/perchance
npm install
npx playwright install chromium
```

## Run

```bash
npm start
# or: node server.js
```

Listens on `http://127.0.0.1:3456/generate` by default.

## Marinara wiring

1. Set `IMAGE_LOCAL_URLS_ENABLED=true` in Marinara server `.env`.
2. **Settings → Connections → Image generation**
3. Service: **Custom HTTP**
4. Base URL: `http://127.0.0.1:3456/generate`

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3456` | HTTP listen port |
| `HOST` | `127.0.0.1` | Bind address |
| `PERCHANCE_GENERATOR_URL` | `https://perchance.org/marinara-t2i-host?marinara=1` | Generator to automate |
| `PERCHANCE_GEN_TIMEOUT_MS` | `180000` | Bridge generate timeout |
| `PERCHANCE_BRIDGE_READY_MS` | `120000` | Wait for `marinara.bridge.generate` |
| `PERCHANCE_NAV_TIMEOUT_MS` | `90000` | Page navigation timeout |
| `PERCHANCE_GUIDANCE_SCALE` | `7` | Passed to text-to-image-plugin |
| `PERCHANCE_REFERENCE_BLUR` | `0.35` | Reference likeness (0–1, lower = stronger) |
| `PLAYWRIGHT_HEADLESS` | `true` | Set `false` to debug visually |

## Request mapping

Marinara payload → `marinara.bridge.generate()`:

| Marinara field | Bridge field | Notes |
|----------------|--------------|-------|
| `prompt` | `prompt` | Required |
| `negativePrompt` | appended to prompt | No native negative field in bridge v1 |
| `width` / `height` | `resolution` | Nearest of 512×512, 512×768, 768×512, 768×768 |
| `seed` | `seed` | `-1` random |
| `referenceImages[0]` | `referenceImage.url` | Sent as `data:` URL; Perchance may require CDN upload for some models |

Jobs run **serially** — Perchance t2i uses a single broker iframe queue.

## How it works

```text
Marinara  →  POST /generate
              Playwright sidecar
                → open perchance.org/marinara-t2i-host?marinara=1
                → wait for window.marinara.bridge.generate
                → bridge.generate({ prompt, resolution, … })
                ← dataUrl
              ← { base64, mimeType }
```

This avoids cross-origin iframe embedding (`X-Frame-Options: sameorigin`) by driving the generator as a top-level Playwright page and calling the same `bridge.generate()` entry point the host UI uses locally.

## Caveats

- **Generator must exist on Perchance** — publish `marinara-t2i-host` (imports `marinara-bridge-plugin`, `text-to-image-plugin`, `upload-plugin`) before relying on the default URL.
- **DOM / plugin changes** break automation; maintain selectors in this sidecar, not Marinara core.
- **ToS / captcha / auth** — your responsibility; Marinara does not bypass anti-bot.
- **Reference images** as raw base64 may not work for all Perchance models; upload-plugin CDN URLs are more reliable (see bridge README).

## Tests

Resolution mapping only (no Playwright):

```bash
npm test
```

Manual smoke test:

```bash
curl -sS -X POST http://127.0.0.1:3456/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"a red cube on white background","width":768,"height":768}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.error||('ok '+j.mimeType+' '+j.base64.length+' chars'))})"
```
