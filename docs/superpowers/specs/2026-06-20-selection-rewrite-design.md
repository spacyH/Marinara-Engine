# Selection Rewrite with Guidance — Design Spec

**Status:** Draft  
**Branch:** `spacyh/feat/01-selection-rewrite`  
**Proposal:** [docs/feature-proposals/01-selection-rewrite-with-guidance.md](../../feature-proposals/01-selection-rewrite-with-guidance.md)

## Summary

Add a highlight-and-instruct flow for revising a substring inside a chat message. Implementation is split between a minimal core API (`POST /api/generate/transform-text`) and a reference client extension that owns the selection UI. Core does not mutate messages; the extension splices the result and persists via the existing message PATCH endpoint.

## Goals

- User selects text in a message, enters a short instruction, receives a replacement for **only that span**
- Surrounding message content stays intact
- Result saved through the normal message edit path
- Upstream PR stays small and general-purpose — the transform endpoint is reusable beyond this feature

## Non-Goals (v1)

- Native core UI in `ChatMessage` / `ConversationMessage`
- Swipe creation or undo-stack integration
- Game-mode segment-level edits (`segment-edits.ts`)
- Streaming partial rewrites

## Current State

| What exists | Limitation |
|-------------|------------|
| Full-message edit (double-click, edit action) | Whole message only |
| `/guided` + “Guide generations” | Steers the **next full generation**, not a substring |
| Guided regenerate | Re-runs the **entire** assistant reply |
| Consistency Editor agent | Rewrites the **whole** post-agent message |
| `POST /api/generate/dryRun` | Full generation preview; wrong shape for span rewrite |
| `PATCH /api/chats/:chatId/messages/:messageId` | Persistence works; no selection/generation hook |

Message bubbles already expose `data-message-id`. Extensions receive a `marinara` API with `apiFetch`, DOM helpers, and `observe`.

## Architecture

```text
Extension (selection UI)
  → POST /api/generate/transform-text
  → splice replacement at offsets (client or shared util)
  → PATCH /api/chats/:chatId/messages/:messageId
```

Core owns the LLM call and prompt scoping. Extension owns UX and persistence orchestration.

## Core Changes

### 1. `POST /api/generate/transform-text`

New route (suggest: `packages/server/src/routes/generate/transform-text-route.ts`, registered alongside other generate routes).

**Request body:**

```ts
{
  chatId: string;
  messageId: string;
  selectedText: string;
  startOffset: number;   // UTF-16 code unit offset in message.content
  endOffset: number;
  instruction: string;
  connectionId?: string;   // default: chat's active connection
}
```

**Response:**

```ts
{ replacementText: string }
```

**Behavior:**

- Load chat and message; verify `selectedText === content.slice(startOffset, endOffset)` — return **400** if mismatch
- Resolve connection (override or chat default); reject if missing
- Build a small scoped prompt:
  - The selected span and user instruction
  - Optional: ~200–500 chars of surrounding context from the message (before/after selection)
  - Active preset macros where cheap to resolve
  - Instruction to return **only** the replacement text for the selection, preserving meaning and voice
- Single non-streaming LLM call via existing provider registry
- Return replacement text; **do not** PATCH the message

**Errors:**

| Code | Condition |
|------|-----------|
| 400 | Invalid offsets, empty selection/instruction, offset/text mismatch |
| 404 | Chat or message not found |
| 409 | Optional: message `updatedAt` changed since client last read (if client sends `expectedUpdatedAt`) |

### 2. Shared splice utility (optional, recommended)

`packages/shared/src/utils/text-splice.ts`:

```ts
function spliceText(content: string, start: number, end: number, replacement: string): string
```

Used by the reference extension and available for future native UI.

### 3. Documentation

Add to `docs/EXTENSIONS.md` (create if missing):

- `data-message-id` on message bubbles
- `marinara:start-edit-message` custom event
- `transform-text` endpoint schema and example `apiFetch` call

## Reference Extension

**File:** `docs/examples/extensions/selection-rewrite.json`

**Behavior:**

1. On `mouseup` / `keyup` within `[data-message-id]` message content areas, check `window.getSelection()`
2. If non-empty selection maps to a single message bubble, show a floating “Rewrite selection…” button
3. On click, show a small popover with instruction input and Submit
4. Compute `startOffset` / `endOffset` relative to the message's plain-text `content` (not rendered HTML)
5. Call `marinara.apiFetch("/generate/transform-text", { method: "POST", body: JSON.stringify(...) })`
6. Re-fetch message; verify offsets still valid; splice; `PATCH` message content
7. On offset mismatch after re-fetch, show error and ask user to re-select

**CSS:** minimal — floating button + popover positioned near selection.

## Key Files

| Area | File |
|------|------|
| New route | `packages/server/src/routes/generate/transform-text-route.ts` |
| Route registration | `packages/server/src/routes/generate.routes.ts` or generate index |
| Shared types/schema | `packages/shared/src/schemas/generate.schema.ts` |
| Splice util | `packages/shared/src/utils/text-splice.ts` |
| Reference extension | `docs/examples/extensions/selection-rewrite.json` |
| Extension docs | `docs/EXTENSIONS.md` |

## Testing

- Unit: offset splice utility; offset validation (mismatch → 400)
- Integration: transform-text with mock LLM provider returns replacement
- Manual: reference extension on roleplay and conversation mode messages

## PR Boundary

**Upstream PR includes:** transform-text endpoint, shared splice util, extension docs, reference extension JSON.

**Not in upstream PR:** native `ChatMessage` UI (future enhancement if extension proves the workflow).

## Open Questions

None — ready for implementation planning.
