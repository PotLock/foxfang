# FoxFang CLI Commands Reference

Complete reference for all FoxFang CLI commands.

---

## Quick Start

```bash
# Start chatting with the AI agent
pnpm foxfang chat

# Run a single task
pnpm foxfang run "Create a marketing campaign for my coffee shop"

# Check system status
pnpm foxfang status
```

---

## Core Commands

### `chat`
Start an interactive chat session with the AI agent.

```bash
pnpm foxfang chat                    # Start chat with default agent
pnpm foxfang chat -a orchestrator    # Use specific agent
pnpm foxfang chat -p my-project      # Use specific project context
```

**Options:**
- `-a, --agent <agent>` - Agent ID to use (default: orchestrator)
- `-p, --project <project>` - Project ID for context
- `-s, --session <session>` - Session ID (creates new if not provided)
- `-m, --model <model>` - Model to use (e.g., gpt-4, kimi-code)
- `--provider <provider>` - Provider to use (openai, anthropic, kimi)

**Chat Commands:**
- Type `/help` - Show available commands
- Type `/clear` - Clear conversation history
- Type `/agents` - List available agents
- Type `/tools` - List available tools
- Type `/save` - Save current session
- Type `exit` or `quit` - End chat

---

### `run`
Run a single agent task (non-interactive).

```bash
pnpm foxfang run "Create a brand for my tech startup"
pnpm foxfang run "Draft 3 LinkedIn posts about AI"
pnpm foxfang run --no-stream "Quick task without streaming"
```

**Options:**
- `-a, --agent <agent>` - Agent ID (default: orchestrator)
- `-p, --project <project>` - Project ID
- `-s, --session <session>` - Session ID
- `--stream` - Stream output (default: true)
- `--no-stream` - Disable streaming
- `-m, --model <model>` - Model to use
- `--provider <provider>` - Provider to use

---

### `status`
Check FoxFang system status.

```bash
pnpm foxfang status              # Full status
pnpm foxfang status --providers  # Provider status only
pnpm foxfang status --channels   # Channel status only
```

---

## GitHub Commands

### `github`
GitHub integration commands.

```bash
# Check GitHub connection status
pnpm foxfang github status

# Connect GitHub via OAuth (opens browser)
pnpm foxfang github login

# Disconnect GitHub
pnpm foxfang github logout

# Create an issue
pnpm foxfang github issue create \
  --repo owner/repo \
  --title "[Bug]: Something is broken" \
  --body "Description here" \
  --labels bug,urgent

# Create a pull request
pnpm foxfang github pr create \
  --repo owner/repo \
  --title "feat: Add new feature" \
  --body "PR description" \
  --base main \
  --head feature-branch

# List issues
pnpm foxfang github issue list --repo owner/repo --limit 10

# List PRs
pnpm foxfang github pr list --repo owner/repo --state open
```

**GitHub via Chat:**
You can also use GitHub via the chat interface:
- "Create a GitHub issue for bug X"
- "Check if I'm connected to GitHub"
- "List open PRs in my-repo"

---

## Channel Commands

### `channels`
Manage messaging channels (Telegram, Discord, Signal, Slack).

```bash
# List configured channels
pnpm foxfang channels list

# Enable a channel
pnpm foxfang channels enable telegram
pnpm foxfang channels enable discord
pnpm foxfang channels enable signal
pnpm foxfang channels enable slack

# Disable a channel
pnpm foxfang channels disable telegram

# Test channel connection
pnpm foxfang channels telegram test

# Send a message via channel
pnpm foxfang channels telegram send -c @username -m "Hello!"
pnpm foxfang channels discord send -c channel-id -m "Hello!"
pnpm foxfang channels signal send -n +1234567890 -m "Hello!"
```

### Setup Channels

```bash
# Interactive channel setup wizard
pnpm foxfang wizard channels
```

---

## Daemon Commands

### `daemon`
Manage the background gateway daemon.

```bash
# Run daemon in foreground (for testing)
pnpm foxfang daemon run

# Install daemon as system service
pnpm foxfang daemon install

# Start daemon service
pnpm foxfang daemon start

# Stop daemon service
pnpm foxfang daemon stop

# Restart daemon service
pnpm foxfang daemon restart

# Check daemon status
pnpm foxfang daemon status

# View daemon logs
pnpm foxfang daemon logs

# Uninstall daemon service
pnpm foxfang daemon uninstall
```

---

## Wizard Commands

### `wizard`
Interactive setup and configuration.

```bash
# Full setup wizard (first time setup)
pnpm foxfang wizard setup

# Configure AI providers
pnpm foxfang wizard providers
pnpm foxfang wizard providers add
pnpm foxfang wizard providers edit
pnpm foxfang wizard providers remove
pnpm foxfang wizard providers test

# Configure channels
pnpm foxfang wizard channels
```

---

## Configuration Commands

### `config`
View and manage configuration.

```bash
# View current config
pnpm foxfang config

# Get specific config value
pnpm foxfang config get defaultProvider

# Set config value
pnpm foxfang config set defaultProvider kimi-coding
pnpm foxfang config set defaultModel kimi-code

# Edit config file directly
pnpm foxfang config edit
```

---

## Memory Commands

### `memory`
Manage agent memory and context.

```bash
# Search memory
pnpm foxfang memory search "marketing campaign"

# Add memory entry
pnpm foxfang memory add "Key insight about target audience"

# List recent memories
pnpm foxfang memory list

# Clear memory
pnpm foxfang memory clear
```

---

## Session Commands

### `sessions`
Manage chat sessions.

```bash
# List saved sessions
pnpm foxfang sessions list

# Resume a session
pnpm foxfang sessions resume session-id

# Delete a session
pnpm foxfang sessions delete session-id

# Export session
pnpm foxfang sessions export session-id > session.json
```

---

## Cron Commands

### `cron`
Scheduled tasks (via chat or daemon).

Via chat interface:
- "Schedule a daily report at 9am"
- "Create a weekly content reminder"
- "List my scheduled tasks"
- "Remove the daily reminder"

---

## Bash Commands

### `bash`
Execute shell commands (via chat).

Via chat interface:
- "Run `ls -la` in my workspace"
- "Check disk usage"
- "Show me the last 10 lines of app.log"

---

## Common Workflows

### First Time Setup

```bash
# 1. Run setup wizard
pnpm foxfang wizard setup

# 2. Verify setup
pnpm foxfang status

# 3. Start chatting
pnpm foxfang chat
```

### Create a Marketing Campaign

```bash
# Via chat
pnpm foxfang chat
# > "Create a Q4 marketing campaign for my coffee shop brand"

# Or via run command
pnpm foxfang run "Create a Q4 marketing campaign for my coffee shop brand"
```

### Setup GitHub Integration

```bash
# Via CLI
pnpm foxfang github login

# Or via chat
pnpm foxfang chat
# > "Connect my GitHub account"
```

### Setup Messaging Channels

```bash
# Interactive setup
pnpm foxfang wizard channels

# Enable specific channel
pnpm foxfang channels enable telegram

# Run daemon to receive messages
pnpm foxfang daemon run
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FOXFANG_HOME` | Custom config directory (default: `~/.foxfang`) |
| `FOXFANG_DEBUG` | Enable debug logging |
| `FOXFANG_LOG_LEVEL` | Log level (debug, info, warn, error) |

---

## Getting Help

```bash
# General help
pnpm foxfang --help

# Command-specific help
pnpm foxfang chat --help
pnpm foxfang github --help
pnpm foxfang channels --help
```

---

## Tips

1. **Use `chat` for complex tasks** - Interactive mode allows follow-up questions
2. **Use `run` for quick tasks** - Single command, get result
3. **Keep daemon running** - Required for receiving messages from channels
4. **Check `status` first** - Verify everything is working before starting
