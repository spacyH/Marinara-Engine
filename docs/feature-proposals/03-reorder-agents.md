# Reorder Agents

## Motivation

Agent behavior depends on **when** each agent runs relative to others — e.g. a tracker updating state before vs. after Consistency Editor, or two writer agents whose injections combine differently. If output is wrong, the fix may be order, not disabling an agent. Users expect to reorder the pipeline like preset sections or regex scripts; today that control doesn’t exist.

## Ideal Outcome

In chat or global agent settings, drag-and-drop (or explicit priority) sets execution order within each phase. Reorder is respected on the next generation. Optional: “run sequentially” vs “batch same connection” for advanced users who understand batching tradeoffs.

## Current State

Agent ordering is **not user-controlled**, and in places it doesn’t mean what you’d expect.

**How order actually works today:**

1. **Phase-locked:** `pre_generation` → (parallel with main gen) → `post_processing` → **text_rewrite agents always last** (hardcoded).
2. **Within a phase:** agents sharing the same connection + model are **batched into one LLM call** — “order” between them is not sequential execution.
3. **Config list order:** from `agent_configs` sorted by `updatedAt`, **not** from `activeAgentIds` array order in chat metadata.
4. **Hardcoded special cases:** lorebook-keeper handled separately; echo-chamber skipped on regen; game state updates sorted before tracker updates when persisting; etc.

Chat settings allow **enable/disable** per chat (Writer / Tracker / Misc categories) but **not** drag-to-reorder.

**Workarounds today:**

- Disable the problematic agent; use **retry-agents** to experiment manually.
- **Manual trackers** mode: trackers don’t auto-run; you trigger them yourself.
- Assign contentious agents **different connections** so they don’t batch together (hacky, not real ordering).

## Implementation Overview

**Feasibility:** Medium as a core feature. Not viable as an extension — execution is server-side.

**Core approach (recommended):**

- Add `sortOrder` (or respect ordered `activeAgentIds`) on agent configs / per-chat overrides.
- Pipeline: honor explicit order within each phase; decide whether to keep batching (faster/cheaper) or offer sequential mode (true order).
- UI: reorder list in chat agent settings (and optionally global Agents panel).
- Document hardcoded rules (text_rewrite last, lorebook-keeper, etc.) so users know what can’t be moved.

**Extension-only:** Not possible — no hook into pipeline orchestration.

**Verdict:** Needs schema + pipeline design. Batching makes “order” a product decision, not just UI.
