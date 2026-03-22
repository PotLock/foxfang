# Changelog

## 2026-03-22

### Refactored — De-hardcode Agent System (-402 lines net)

Replaced keyword matching, regex heuristics, and canned strings with LLM-driven routing and registry-sourced tool metadata.

**Foundation Cleanup**
- Removed URL note injection (`[Note: Use fetch_tweet tool]`) — trust tool descriptions.
- `promptMode: 'none'` reads identity from workspace `SOUL.md` instead of hardcoded string.
- Added `isChannelSession` to `AgentContext` — replaces `sessionId.startsWith('channel-')`.
- Threaded `userId` into `RunRequest` — resolved once instead of hardcoded 3x.

**Config-driven Model Tiers**
- Added `smallModel` to `ProviderConfig` for explicit small model configuration.
- `resolveModelFromExecutionProfile` reads from config instead of regex matching (`/gpt-4o(?!-mini)/i`, `/sonnet/i`).

**Dynamic Tool Section**
- Deleted `TOOL_SUMMARIES` dictionary (60 lines) — descriptions now from tool registry.
- Deleted hardcoded category map — uses `tool.category` from registry.
- Deleted tool selection decision tree (25 lines caps-lock instructions).
- Simplified `TOOL_CALL_STYLE_GUIDANCE` from 25 lines to 4.

**Unified LLM Routing**
- Deleted 6 heuristic functions: `detectOutputMode`, `detectNeedsTools`, `detectNeedsReview`, `scoreRule`, `inferTaskType`, `classifyRouteHeuristic`.
- Simplified `RoutingPolicy` — removed `outputModeHints`, `toolTriggers`, `reviewTriggers`, `highStakesTriggers`.
- LLM routing is now the primary path; config rules are deterministic overrides.
- Deleted `pickTargetAudience`, `inferExpectedOutput` — LLM infers from context.
- Simplified `buildOutputSpec` — removed keyword-to-format mapping and hardcoded `mustInclude`.
- Extracted routing prompt to `src/agents/routing-prompt.ts`.

**Quality Check Redesign**
- Deleted `runQualityCheck` and 7 supporting functions (magic numbers: 60/120/220 chars, lexical density >= 0.45, `/as an ai/` regex).
- Removed quality-floor mini-fix rewrite loop.
- Trimmed deliverable tag instructions from 9 lines to 1.

**Tool Registration**
- Moved `require()` to module scope in `src/tools/index.ts`.

### Enhanced
- Dashboard telemetry now includes:
  - top requests by token burn
  - top requests by latency
- Added `--json` mode for `foxfang dashboard` to support automation/analysis pipelines.
- Request traces now include `createdAt` timestamps for better request-level time analysis.

## 2026-03-21

### Added
- Thin-router orchestration flow (`user -> orchestrator -> primary specialist -> optional reviewer -> quality floor`).
- Route classification + handoff packet + output spec pipeline.
- Compact context builder (`recent messages`, `session summary`, `top memories`, `project facts`).
- Rolling session summary (`currentGoal`, `importantDecisions`, `activeConstraints`, `openLoops`).
- Runtime token budget module by agent role and reasoning mode.
- Tool result compaction pipeline with structured compact payloads.
- Cached raw expansion tools:
  - `expand_cached_result`
  - `get_cached_snippet`
- Persistent tool-result artifact cache with TTL.
- Request trace telemetry (`request-trace-YYYY-MM-DD.jsonl`).
- CLI dashboard command:
  - `foxfang dashboard --days <n> --top <n>`
  - Top agents/tools by token and compaction metrics.
- Wizard setting for tool cache TTL:
  - `agentRuntime.toolCacheTtlMs` in `foxfang.json`.

### Changed
- Reduced default tool scope per specialist in agent registry.
- System prompt construction split into clearer layers (core identity, tool section, skills section, task context).
- Brand context loading now uses compact brief instead of full long text.
- Reviewer path now uses structured critique and bounded rewrite pass.
- Quality floor added before final response to avoid overly generic/too-short output.
- `docs/commands.md` updated to include `dashboard` command.

### Removed
- Tool cache TTL dependency on environment variable (`FOXFANG_TOOL_CACHE_TTL_MS`).
- TTL control moved to config + wizard flow.

### Notes / Current Limitations
- Retrieval re-ranking (#13) is still limited because memory retrieval is not yet a full pipeline.
- Model tier mapping currently uses runtime heuristics; provider/model map config can be deepened further.
- Request-level global hard cap is not fully enforced end-to-end yet (per-agent budget is implemented).
