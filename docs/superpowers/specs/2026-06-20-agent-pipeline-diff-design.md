# Show Agent Changes (Pipeline Diff) — Design Spec

**Status:** Draft  
**Branch:** `spacyh/feat/02-agent-pipeline-diff`  
**Proposal:** [docs/feature-proposals/02-show-agent-changes.md](../../feature-proposals/02-show-agent-changes.md)

## Summary

Expose durable per-message agent pipeline data so users can see what the raw model produced and how each agent changed it — especially `text_rewrite` stages like Consistency Editor. Core writes a `pipelineSnapshot` on the message at generation time and exposes a read-only runs API. A reference extension renders a timeline + diff panel.

## Goals

- For any assistant message, view raw model output before post-processing rewrites
- See each agent that ran, in pipeline order, with result summaries
- For `text_rewrite` agents, show before/after text (or inline diff)
- Data persists across refresh — not limited to ephemeral thought bubbles

## Non-Goals (v1)

- Native core debug panel in message actions menu
- Live SSE-driven extension panel during generation
- Edit injections or retry agents from the diff panel
- Full prompt peek integration (separate feature)

## Current State

| What exists | Limitation |
|-------------|------------|
| Agent thought bubbles (`AgentThoughtBubbles`) | Ephemeral; editor shows `✏️ description`, not before/after text |
| `message.extra.contextInjections` | Pre-generation injections only |
| `agent_runs` table + `saveRun()` | Persisted but no API for built-in runs per message |
| `GET /api/agents/runs/:chatId/custom` | Custom agents only |
| `text_rewrite` in generate flow | Overwrites message content; pre-rewrite text not stored |

**Critical gap:** For past messages, you cannot reconstruct “model said X, editor changed it to Y.”

## Architecture

```text
generate.routes.ts (during generation)
  → write message.extra.pipelineSnapshot (before text_rewrite overwrites)
  → saveRun() to agent_runs (existing)

Extension (pipeline viewer)
  → read message.extra.pipelineSnapshot from message payload
  → GET /api/agents/runs/message/:messageId (supplementary detail)
  → render timeline + diff modal
```

## Core Changes

### 1. `message.extra.pipelineSnapshot`

Add to `MessageExtra` in `packages/shared/src/types/chat.ts`:

```ts
pipelineSnapshot?: {
  rawGeneration: string;
  stages: Array<{
    agentType: string;
    agentName?: string;
    resultType: string;
    summary?: string;      // e.g. joined change descriptions
    textBefore?: string;     // text_rewrite stages only
    textAfter?: string;      // text_rewrite stages only
  }>;
} | null;
```

**Write timing** (in `packages/server/src/routes/generate.routes.ts`):

1. After main LLM response is complete, set `rawGeneration = currentResponse`
2. As each post-processing agent completes, append a stage entry:
   - All agents: `agentType`, `agentName`, `resultType`, `summary` (from result metadata)
   - `text_rewrite`: also capture `textBefore` (response before rewrite) and `textAfter` (`editedText` from result)
3. Before applying `text_rewrite` to message content, persist snapshot to message/swipe `extra`
4. Snapshot write is **non-fatal** — log warning and continue generation on failure

**Size cap:** ~32 KiB total per snapshot. If exceeded, truncate `textBefore`/`textAfter` with a `…[truncated]` marker. Drop oldest non-rewrite stages first if still over limit.

Store on the active swipe's `extra` (same pattern as `contextInjections`, `spriteExpressions`).

### 2. `GET /api/agents/runs/message/:messageId`

New route in `packages/server/src/routes/agents.routes.ts`.

**Response:** Array of serialized runs (reuse `serializeRunWithConfig` from `agents.storage.ts`):

```ts
Array<{
  id: string;
  agentConfigId: string;
  agentType: string;
  agentName: string;
  chatId: string;
  messageId: string;
  resultType: string;
  resultData: unknown;
  tokensUsed: number;
  durationMs: number;
  success: boolean;
  error: string | null;
  createdAt: string;
}>
```

**Behavior:**

- Query `agent_runs` where `messageId = :messageId`, ordered by `createdAt` asc
- Join `agent_configs` for type/name
- **404** if message does not exist
- Empty array if no runs
- Accessible via extension `apiFetch` (not on denylist)

### 3. Documentation

Document `pipelineSnapshot` shape and runs API in `docs/EXTENSIONS.md`.

## Reference Extension

**File:** `docs/examples/extensions/agent-pipeline-viewer.json`

**Behavior:**

1. `observe` the chat message list container
2. For each assistant `[data-message-id]` bubble, inject a small “Pipeline” button into the action area (or hover menu)
3. On click:
   - Read `message.extra.pipelineSnapshot` from cached chat data (via `apiFetch GET /chats/:chatId` or message already in DOM store)
   - Optionally fetch `GET /api/agents/runs/message/:messageId` for token/timing detail
4. Render modal:
   - **Timeline:** raw generation → stage 1 → stage 2 → … → final content
   - **Diff view:** for stages with `textBefore`/`textAfter`, show a simple line-by-line diff (extension-side, no new core dep)
   - Stages without text diff show `summary` only

**CSS:** modal overlay, monospace diff blocks, stage labels.

## Key Files

| Area | File |
|------|------|
| Types | `packages/shared/src/types/chat.ts` (`MessageExtra`) |
| Snapshot write | `packages/server/src/routes/generate.routes.ts` |
| Retry path | `packages/server/src/routes/generate/retry-agents-route.ts` (write snapshot on retry too) |
| Runs API | `packages/server/src/routes/agents.routes.ts` |
| Storage query | `packages/server/src/services/storage/agents.storage.ts` (`listRunsForMessage`) |
| Reference extension | `docs/examples/extensions/agent-pipeline-viewer.json` |

## Testing

- Integration: after generation with Consistency Editor, `pipelineSnapshot.rawGeneration` differs from final message content
- `text_rewrite` stage has `textBefore` and `textAfter`
- Snapshot size cap truncates without failing generation
- Runs API returns runs in chronological order
- Regenerate / retry-agents updates or appends snapshot appropriately

## PR Boundary

**Upstream PR includes:** `pipelineSnapshot` type + write logic, runs API, reference extension, docs.

**Not in upstream PR:** native debug drawer, live SSE events.

## Open Questions

- **Regenerate behavior:** replace snapshot on regen, or append version history? **Recommendation:** replace on new swipe; each swipe's `extra` holds its own snapshot.
- **Pre-generation stages:** include in snapshot? **Recommendation:** yes, as stages with `resultType: "injection"` and `summary` only (no text diff).
