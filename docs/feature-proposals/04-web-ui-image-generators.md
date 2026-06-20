# Web UI Image Generators (No Public API)

## Motivation

Many image services are only usable through a web UI — no stable public API, or API access gated behind tiers Marinara doesn’t integrate. Users still want to try those models from chat/game flows (illustrator agent, avatars, scene art) without leaving their Marinara workflow.

## Ideal Outcome

Configure an image “connection” that targets a UI-only service: Marinara sends prompt + parameters, receives an image back, stores it like any other generated asset. Ideally pluggable (user-provided adapter) rather than one-off hacks per site.

## Current State

Image generation is **API-oriented only**.

Supported backends (Settings → Connections → Image generation) include OpenAI, Stability, Together, NovelAI, OpenRouter, xAI, Pollinations, Horde, AUTOMATIC1111/Forge, ComfyUI, RunPod ComfyUI, Draw Things, NanoGPT, Block Entropy, and similar. All assume a **URL + known API shape**, not driving a website in a browser tab.

The in-app **Browser** panel imports characters from sites like CharTavern — it does **not** automate arbitrary image UIs.

## Implementation Overview

**Feasibility:** No generic built-in support today. New integration per site, or a user-run automation layer.

| Approach | Feasibility | Fragility |
|----------|-------------|-----------|
| **(a) External Playwright/Puppeteer proxy** + Marinara **custom tool** or **webhook** | Best practical path | Medium — DOM changes, auth, captcha, ToS |
| **(b) Browser extension** coordinating Marinara tab ↔ generator tab | Possible | High — permissions, anti-bot, no shared API |
| **(c) Marinara client extension** tab bridge (`BroadcastChannel` / `postMessage`) | Demo only | Very high |
| **(d) Use an API or local backend** (ComfyUI, A1111, Pollinations, etc.) | Best when available | Low |

**Recommended path without core changes:**

- Run a small local **automation proxy** (Playwright) that exposes a simple HTTP API your scripts maintain per site.
- Wire it via **custom tool** (webhook) or a thin Marinara image backend if you add one in core later.

**Core approach (if building in-repo):**

- New `imageService` type + adapter interface; or official “sidecar” pattern (like local LLM sidecar) for browser automation.
- Each UI-only provider still needs a maintained adapter — not one generic “any website” integration.

**Verdict:** Not plug-and-play. Custom tool → your proxy is the most update-friendly extension point today. Pollinations or local Comfy/A1111 are the lowest-friction built-in options.
