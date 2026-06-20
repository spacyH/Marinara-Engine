# Selection Rewrite with Guidance

## Motivation

When editing roleplay or chat messages, you often want to fix a single awkward phrase, tighten one paragraph, or adjust tone in one spot — without regenerating the entire reply or hand-editing the rest by hand. A highlight-and-instruct flow (“make this more formal”, “keep meaning but shorten”) matches how people actually revise prose.

## Ideal Outcome

The user selects text inside a message, enters a short instruction, and the model returns a replacement for **only that span**. The surrounding message stays intact. The result is saved through the normal message edit path (with swipe/history behavior consistent with other edits).

## Current State

Marinara supports related workflows, but not partial rewrite:

| What exists | Limitation |
|-------------|------------|
| Full-message edit (double-click in roleplay, or edit action) | Whole message only |
| `/guided` + “Guide generations” setting | Steers the **next full generation**, not a substring |
| Guided regenerate (input box has text + regenerate) | Re-runs the **entire** assistant reply with that guidance |
| Consistency Editor agent | Rewrites the **whole** post-agent message, not a selection |

There is no text-selection UI tied to generation. Message content can be updated via `PATCH /api/chats/:chatId/messages/:messageId`.

## Implementation Overview

**Feasibility:** Medium as a first-class feature; medium–high fragility as an extension-only hack.

**Core approach (recommended):**

- Add client UI: selection capture on message bubbles → small prompt popover → submit.
- Add a server endpoint (or generate variant): selected text + user instruction + message/chat context → model returns replacement span.
- Splice the replacement into the message and persist via existing message PATCH.
- Reuse active connection/preset; keep the prompt small and scoped to the selection.

**Extension-only workaround (possible but janky):**

- Extension captures `window.getSelection()`, calls `dryRun` or an external webhook, splices result, PATCHes the message.
- Fragile around DOM structure, streaming races, and undo semantics.

**Verdict:** Not available today. Strong UX win; reasonably buildable in core. Extension-only version is possible but not ideal.
