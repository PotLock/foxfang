# Setup Wizard and Web UI for Bindings

## Goal

Provide first-class setup flows for `autoReply.bindings` so users can manage routing without manual JSON editing.

## CLI Wizard

Command:
- `pnpm foxfang wizard bindings`

Supported actions:
- add binding
- edit binding
- remove binding
- clear all bindings
- list current bindings

Fields supported in the wizard:
- `id`
- `enabled`
- `priority`
- `agentId`
- `channel`
- `chatType`
- `sessionScope`
- `chatId`, `threadId`, `fromId`, `accountId`
- `metadata` (`k=v1,v2; k2=v3` format)

Source:
- `src/cli/commands/wizard.ts`

## Web Setup UI (`/setup`)

New section: **Auto-Reply Routing**
- default fallback agent selector
- default session scope selector
- dynamic binding rows (add/remove/edit inline)

Each binding row supports:
- identity and routing fields
- scope and matcher filters
- metadata filter input

Sources:
- `src/web/setup/setup-page.html`
- `src/daemon/gateway-server.ts`

## API Integration

`GET /setup/status` now returns:
- `autoReply.defaultAgent`
- `autoReply.defaultSessionScope`
- normalized `autoReply.bindings`

`POST /setup/config` now accepts and persists:
- `autoReply.defaultAgent`
- `autoReply.defaultSessionScope`
- `autoReply.bindings`

Sanitization and normalization are applied server-side before saving.

## Benefits

- no env var dependency for routing setup
- no manual `foxfang.json` editing needed
- parity between CLI setup and web setup for binding management
