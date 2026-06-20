# Show Agent Changes (Pipeline Diff / Debug View)

## Motivation

Marinara’s agent pipeline can materially change what the user sees: pre-generation injections shape the prompt, post-processing agents update trackers and lore, and Consistency Editor rewrites the final text. When output feels wrong, it’s hard to tell whether the base model, a specific agent, or agent ordering caused it. A per-message view comparing **raw generation → each agent’s effect** would make tuning and debugging much faster.

## Ideal Outcome

For any assistant message, open a debug panel that shows:

1. The **raw model output** (before post-processing rewrites).
2. Each agent that ran on that turn, in pipeline order, with its result summary.
3. Where text changed (especially Consistency Editor / `text_rewrite`), a before/after or inline diff.
4. Durable access after refresh — not only live thought bubbles.

## Current State

Partial debugging exists; no full diff pipeline.

**What you can see today:**

- **Agent thought bubbles** (Agents menu → Activity): per-agent summaries during/after a turn. Consistency Editor shows change *descriptions* (`✏️ …`), not before/after text. Cleared on dismiss; not a durable audit log.
- **Injections tab** (chat settings → “Show Injections tab”): cached **pre-generation** injections on `message.extra.contextInjections`. Editable; re-run via regenerate.
- **Review outputs** (chat settings → Writer Agents): pauses **before** the main model runs so you can edit writer injections — not post-hoc comparison.
- **Retry agents** (`POST /api/generate/retry-agents`): re-run specific agents on a message.
- **Peek Prompt**: what was sent to the model, not agent-stage diffs.

**Critical gap:** The raw model output is saved, then post-processing (especially Consistency Editor `text_rewrite`) **overwrites** message and active swipe content. Pre-agent text is **not** stored in `message.extra`. For past messages you often cannot reconstruct “model said X, editor changed it to Y.”

The server **does** persist `agent_runs` per message, but there is no UI/API to list all runs for a built-in agent on a given message (custom-agent runs are exposed via `/api/agents/runs/:chatId/custom`).

## Implementation Overview

**Feasibility:** High value, medium effort as a core feature. Poor fit for extensions alone — data isn’t surfaced.

**Core approach (recommended):**

- At generation time, store `rawGeneration` (and optionally per-stage snapshots) on `message.extra` or swipe extra before `text_rewrite` overwrites content.
- Expose `GET` (or include in message payload) agent runs for a `messageId` from `agent_runs`.
- Client: “Agent pipeline” panel on message actions — timeline + diff for rewrite agents.

**Extension-only:** Not viable without new APIs; extensions cannot read `agent_runs` or pre-rewrite text today.

**Verdict:** Best candidate for a core contribution. Today you can see *which* agent did *what class* of thing, not a faithful text diff through the pipeline.
