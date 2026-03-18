# AGENTS.md - FoxFang 🦊 Agent Specification

This file defines the product-facing agent system for FoxFang.

## 1) Agent topology (minimal and practical)

The platform uses one coordinator + three specialist agents per project:

- `OrchestratorAgent` (system)
  - Receives requests from chat/UI
  - Loads project context (brand memory, idea stream, pipeline state)
  - Delegates tasks and returns final output

- `Strategy Lead`
  - Campaign planning and brief writing
  - Research synthesis and positioning

- `Content Specialist`
  - Draft generation and variant production
  - Enforces project-specific tone constraints

- `Growth Analyst`
  - Performance analysis and channel signals
  - Optimization recommendations and experiment ideas

## 2) Memory layers (project-scoped)

- `BrandMemory`: guidelines, tone, audience, visual/content rules
- `WorkingMemory`: temporary context for the active task/session
- `LongTermMemory`: approved outputs + feedback-derived patterns

All memory records must include `project_id`.

## 3) Learning loop

1. Human reviewers submit score + notes
2. System extracts structured improvement signals
3. Memory updates apply with confidence thresholds
4. Provenance is stored (`source`, `reviewer`, `timestamp`, `content_id`)
5. Prompt templates are adjusted for future generation

## 4) Tone-of-voice enforcement

Each project owns a `ToneProfile` with:

- Do/Don't guidance
- Preferred vocabulary
- Style rhythm and sentence constraints
- CTA style patterns
- Forbidden words and claims

Writer and BrandReviewAgent must validate outputs against `ToneProfile` before returning results.

## 5) Initial event contract (SSE)

- `project.context.loaded.v1`
- `idea.ingested.v1`
- `content.draft.generated.v1`
- `content.edited.v1`
- `content.approved.v1`
- `feedback.submitted.v1`
- `memory.updated.v1`
- `agent.error.v1`

## 6) Human-in-the-loop reviewers

Initial reviewers: `You`, `Stephen`, `Mark`, `Peter`.

Goal: reach a consistent publish-quality threshold before increasing automation depth.

## 7) Agent-to-agent handoff

Agents can delegate work using structured directives:

```
MESSAGE_AGENT: Content Specialist | Please draft a LinkedIn post based on this brief: ...
```

The gateway routes the follow-up to the named agent within the same project/task context.
