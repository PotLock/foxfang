# CLAUDE.md - Implementation Guardrails

This document defines execution rules for coding agents working on FoxFang.

## Mission

Build FoxFang 🦊 — a personal AI marketing agent that helps individuals and small teams create, manage, and optimize their marketing with minimal effort:

- One HTTP gateway (REST + SSE) to the frontend
- Per-project long-term memory
- Brand-specific tone control
- Real-time dashboard workflow in `ui/`

## Product invariants

1. `Project = Brand` is the top-level boundary.
2. Memory and tone never leak across projects.
3. Every content artifact moves through: `Analyze -> Draft -> Edit -> Approve`.
4. Human feedback is the primary learning signal.

## Engineering invariants

1. Keep the backend architecture minimal (no channel matrix complexity).
2. All transport contracts must be typed and runtime-validated.
3. Agent actions must be traceable through structured logs/events.
4. Memory writes must include provenance (`source`, `actor`, `timestamp`).

## Code standards

- TypeScript strict mode in both `ui/` and backend (`src/`).
- Use Zod (or equivalent) for runtime payload validation.
- Use event naming: `domain.action.v1`.
- Never hardcode brand voice in code; read from project memory.
- Add tests for state transitions and memory merge/update behavior.

## Suggested backend modules

- `gateway/`: Express HTTP API + SSE stream endpoints
- `agent/`: orchestrator, loop, prompt builder, and dispatcher
- `sessions/`: in-memory task/session state
- `memory/`: retrieval and long-term updates with provenance
- `workspace/`: file-based agent workspace bootstrap
- `providers/`: LLM provider adapters and routing
- `tools/`: tool registry and built-in tools
- `database/`: per-user SQLite access
- `plugins/`: optional capability extensions
- `cron/`: scheduled background tasks
- `observability/`: structured traces and logs

## Suggested frontend modules

- `dashboard-shell`: layout, project switcher, nav
- `chat-panel`: real-time agent conversation
- `idea-stream`: inspiration inbox and tagging
- `pipeline-board`: workflow stages and task cards
- `feedback-panel`: scores, notes, and retraining actions

## Milestones

1. Documentation and architecture baseline
2. Backend gateway + project context loading
3. Memory-enabled drafting loop
4. Dashboard implementation with live events
5. Feedback-to-memory continuous improvement loop
