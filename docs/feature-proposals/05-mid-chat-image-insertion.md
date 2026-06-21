# Mid-Chat Image Insertion (Illustrate at a Message)

## Motivation

Gallery **Illustrate** and the automatic **Illustrator** agent only target the **latest** narrative beat (or whatever ran on the most recent turn). Users often want to add a scene image **in the middle of an existing thread** — at a specific assistant or user message — using context **as it stood at that point**, without regenerating text or replaying the whole chat from there.

Example: re-reading an old chapter and wanting a visual for one exchange; fixing a thread that never got an illustration when the Illustrator skipped it (`shouldGenerate: false`).

## Ideal Outcome

On any eligible message, a hover action (e.g. paintbrush **“Illustrate moment”**) that:

1. Builds agent/image context from messages **up to and including** that anchor (respecting conversation-start markers and `hiddenFromAI`).
2. Uses the Illustrator (or a dedicated prompt step) to produce an image prompt for **that** beat.
3. Generates via the configured image connection, saves to the chat gallery, and **attaches the image to the anchored message** (same as automatic illustrations).
4. Shows inline in the transcript; supports swipes on that message row.

No full message regeneration. Later messages in the thread are ignored for context.

## Current State

Most of the pipeline **already exists**; the gap is UX and one behavioral rule.

| What exists | Role |
|-------------|------|
| `POST /api/generate/retry-agents` with `forMessageId` | Slices history to `messages[conversationStart … anchor]`; used by Secret Plot and context-injection re-rolls |
| Illustrator retry path in `retry-agents-route.ts` | `image_prompt` → `generateImage()` → `saveImageToDisk()` → `appendMessageAttachment` / swipe extras |
| SSE `illustration` event + client refresh | Same as gallery Illustrate |
| Message `extra.attachments` rendering | `ConversationMessage` / `ChatMessage` show images under the bubble |
| Gallery **Illustrate** button | `retryAgents(chatId, ["illustrator"])` — **no** `forMessageId` → always latest assistant turn |

**Critical gaps:**

1. **No message-level UI** — nothing in the message hover action bar triggers illustrate-at-anchor.
2. **`forMessageId` must be an assistant message** — user-message anchors are rejected today.
3. **Illustrator can refuse** — built-in prompt returns `shouldGenerate: false` for “unimportant” beats; manual illustrate must **force** generation or users get no image after clicking.
4. **Gallery-level loading only** — `illustratingChatIds` is per-chat, not per-message.

**Prerequisites** (unchanged from automatic Illustrator):

- Illustrator agent enabled (Settings → Agents).
- Image generation connection on the Illustrator (or default agent image connection).
- Chat LLM connection for the agent that writes the image prompt.

Selfies and chat **Commands** are unrelated.

## Implementation Overview

**Feasibility:** **Low–medium** effort. Reuses retry-agents, image generation, gallery, and attachments; net-new work is UI + `forceIllustrate` (or equivalent).

### Recommended approach (MVP)

**Assistant messages only** in roleplay and conversation surfaces (and game if desired).

#### Client

- Add `MsgAction` to `ConversationMessage` and `ChatMessage` hover bars (paintbrush icon, title e.g. “Illustrate moment”).
- Handler: `retryAgents(chatId, ["illustrator"], { forMessageId: message.id, forceIllustrate: true })`.
- Per-message busy state (disable button / spinner on that row while retry stream runs).
- Gate: hide or disable when Illustrator disabled or no image connection; tooltip with setup hint.
- Reuse existing `illustration` SSE handling in `use-generate.ts` (invalidate messages + gallery).

Wire props from `ConversationView` / `ChatRoleplaySurface` / `ChatArea` → `retryAgents` from `useGenerate`.

#### Server

- Extend `POST /generate/retry-agents` body with `forceIllustrate?: boolean`.
- In illustrator post-processing (`applyRetryResultEffects`):
  - When `forceIllustrate` is true, do **not** skip generation solely because `shouldGenerate === false`.
  - If the agent returns an empty `prompt`, run a fallback prompt build from anchored context (or a second LLM call with an explicit “user requested illustration” instruction).
- Keep attaching to `retryMessageId` / `retrySwipeIndex` (already the anchor when `forMessageId` is set).

Optional: dedicated `POST /api/chats/:chatId/messages/:messageId/illustrate` that internally calls the same logic — clearer API, slightly more surface area.

#### Reference images

If Illustrator **Use avatar references** is enabled, existing ref collection in the retry illustrator block should apply at the anchor — no new feature required for MVP.

### Follow-ups (post-MVP)

| Enhancement | Notes |
|-------------|--------|
| **User-message anchor** | Slice through the user message; attach to that message; relax `forMessageId` role check |
| **Re-illustrate policy** | Replace existing attachment vs append second image |
| **Prompt preview** | Modal before spending image-gen credits |
| **Conversation mode** | Same button on `ChatConversationSurface` if product wants parity beyond roleplay |
| **Without Illustrator agent** | Lighter path: chat LLM summarizes scene at index → `generateImage` only; larger scope |

### What not to build

- New storage model — `chat_images` + `message.extra.attachments` is sufficient.
- New image backend — uses existing Illustrator image connection.
- Full chat branch/regenerate from anchor — out of scope; this is insert-only.

### Effort estimate

| Scope | Estimate |
|-------|----------|
| MVP — assistant messages, `forceIllustrate`, hover button, basic loading/errors | ~4–8 hours |
| Polished — user messages, both message components, per-message spinner, re-illustrate rules | ~1–2 days |

### Testing (manual)

- [ ] Illustrate on an **old** assistant message; image reflects that turn, not the latest.
- [ ] Image appears under the correct message and in gallery; survives refresh and swipe switch.
- [ ] Click when Illustrator would have returned `shouldGenerate: false` — image still generates.
- [ ] Missing image connection — clear error, no silent no-op.
- [ ] Illustrate while another generation is running — sensible disable or queue behavior.

## Related docs

- Automatic Illustrator: built-in agent `illustrator` in Settings → Agents.
- Gallery Illustrate: latest-turn only (`ChatGallery` → `onIllustrate`).
- Web UI backends (if illustrate uses a Playwright sidecar): [04-web-ui-image-generators.md](./04-web-ui-image-generators.md).

## Verdict

**Not a greenfield feature.** Mid-chat insertion is mostly exposing `forMessageId` + illustrator retry in the message hover UI and adding **`forceIllustrate`** so manual requests aren’t blocked by the agent’s “is this moment important?” gate. Best first PR: assistant-only MVP; user-message anchors as a fast follow-up.
