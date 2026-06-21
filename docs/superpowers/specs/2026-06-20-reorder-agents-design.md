# Reorder Agents — Design Spec

**Status:** Draft  
**Branch:** `spacyh/feat/03-reorder-agents`  
**Proposal:** [docs/feature-proposals/03-reorder-agents.md](../../feature-proposals/03-reorder-agents.md)

## Summary

Let users control agent execution order within each pipeline phase by reordering the per-chat `activeAgentIds` list. **Batching is preserved** — agents sharing the same connection+model still run in a single LLM call. Reorder affects batch grouping and agent order within a batch prompt, not true sequential execution.

## Goals

- Drag-and-drop reorder in chat agent settings
- Persisted order respected on the next generation
- No new schema migration — reuse existing `activeAgentIds: string[]` on `ChatMetadata`
- Document hardcoded pipeline rules so users know what cannot be moved

## Non-Goals (v1)

- True sequential execution within the same connection+model (`agentExecutionMode: "sequential"`)
- Global agent reorder (across all chats) — use per-chat `activeAgentIds` only
- Reorder across phase boundaries (pre → post → rewrite)
- Extension-based reorder UI

## Design Decision: Batch-Preserving Order

**Chosen approach (A):** Preserve batching.

| Aspect | Behavior |
|--------|----------|
| Same connection + model | Still batched into one LLM call |
| Order effect | Determines which agents are grouped together and their order **within** the batch prompt |
| Cost / latency | Unchanged from today |
| User expectation | Document clearly: reorder ≠ “run one after another” |

True sequential mode is deferred unless user feedback demands it.

## Current State

| Rule | Today |
|------|-------|
| Phase order | `pre_generation` → `parallel` → `post_processing` → `text_rewrite` last (hardcoded) |
| Within phase | Batched by provider+model (`agent-pipeline.ts`) |
| Config list order | `agent_configs` sorted by `updatedAt` desc — **not** `activeAgentIds` order |
| Per-chat control | Enable/disable via `activeAgentIds` set membership, not order |
| UI precedent | Regex script drag-reorder in `AgentsPanel.tsx` |

## Architecture

```text
ChatSettingsDrawer (drag reorder)
  → rewrite activeAgentIds array order
  → PATCH chat metadata

generate.routes.ts (resolve agents)
  → filter to enabled agents in activeAgentIds
  → sort by index in activeAgentIds within each phase
  → pass to agent-pipeline.ts (batching unchanged)
```

## Core Changes

### 1. Sort by `activeAgentIds` order

In agent resolution (likely `generate.routes.ts` and shared resolve helper):

```ts
function sortAgentsByActiveList<T extends { id: string; type: string }>(
  agents: T[],
  activeAgentIds: string[],
): T[]
```

- When `activeAgentIds` is **non-empty**: sort enabled agents by their first matching index in the array (match by agent config `id` or built-in `type`, consistent with existing enable/disable logic)
- When `activeAgentIds` is **empty** (global mode): keep current `updatedAt` desc fallback
- Agents not in the list remain excluded (existing behavior)

Apply sort **within each phase** before passing to `groupByProviderModel()` in `agent-pipeline.ts`.

### 2. Preserve hardcoded rules (unchanged)

Document and do not alter:

- `text_rewrite` agents always run last in post-processing
- `lorebook-keeper` handled separately
- `echo-chamber` skipped on regenerate
- `manualTrackers` strips tracker agents from auto pipeline
- Game state / tracker persistence sort order (separate from execution order)

### 3. Drag-reorder UI in `ChatSettingsDrawer`

Reuse drag pattern from `AgentsPanel.tsx` regex scripts:

- Agent list in chat settings (Writer / Tracker / Misc sections, or unified list)
- `draggable` rows; on drop, rewrite `activeAgentIds` preserving enabled set, new order
- Persist via existing chat metadata PATCH
- Visual hint: “Order affects batch grouping. Agents on the same connection still run together.”

### 4. Documentation

Add “Agent order” section to user-facing docs or `docs/EXTENSIONS.md`:

- Phase boundaries are fixed
- Batching semantics
- Workaround for “must run sequentially”: assign different connections to force separate calls

## Key Files

| Area | File |
|------|------|
| Agent resolution | `packages/server/src/routes/generate.routes.ts` |
| Pipeline batching | `packages/server/src/services/agents/agent-pipeline.ts` (no batching logic change) |
| Retry path | `packages/server/src/routes/generate/retry-agents-route.ts` |
| Chat metadata type | `packages/shared/src/types/chat.ts` (`activeAgentIds`) |
| Settings UI | `packages/client/src/components/chat/ChatSettingsDrawer.tsx` |
| Drag precedent | `packages/client/src/components/panels/AgentsPanel.tsx` |

## Testing

- Unit: `sortAgentsByActiveList` with mixed id/type matching
- Integration: two agents same connection — verify batch still one call (mock provider call count)
- Integration: reorder changes agent order within batch prompt payload
- UI: drag reorder persists `activeAgentIds` order across reload
- Edge: empty `activeAgentIds` falls back to `updatedAt` order

## PR Boundary

**Upstream PR includes:** sort-by-active-list logic, drag UI, documentation.

**Not in upstream PR:** `sortOrder` column on `agent_configs`, sequential execution mode, global reorder in `AgentsPanel`.

## Open Questions

None — ready for implementation planning.
