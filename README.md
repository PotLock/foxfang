# FoxFang 🦊

**Autonomous marketing platform powered by AI agents.**

FoxFang is your personal AI marketing agent — a clever companion that learns your unique style, manages your campaigns, and helps you create content that truly resonates with your audience. Think of it as having a brilliant marketing teammate in your pocket, available 24/7 to help you grow your brand.

> From ~10 hours/week of manual marketing work → ~20 minutes/week of review and approval.

---

## Demo

```
SETUP (one-time, ~15 min):
  1. Create a project with brand profile
  2. Pick a campaign template
  3. Set a schedule (weekly, daily, or manual)
  4. Connect Twitter/X (optional)

WEEKLY (~20 min):
  1. Drop ideas into the Idea Stream
  2. Review the batch of agent-produced content
  3. Approve, reject, or leave feedback
  4. Agents learn from your feedback and improve
```

---

## Features

### Autonomous Campaign Pipelines

Define multi-step campaign templates. Agents execute every step — strategy, drafting, review — on schedule or on demand.

- 3 built-in templates (Weekly Content Calendar, Single Content Piece, Campaign Launch Package)
- Self-review quality gates: score >= 4/5 auto-advances, low scores auto-retry
- Cron scheduling for recurring campaigns
- Idea-triggered pipelines: drop an idea → campaign starts automatically

### Agent System

Three default agents per project, each with a specialized role:

| Agent | Role |
|-------|------|
| Strategy Lead | Campaign planning, research, content calendars |
| Content Specialist | Drafting, tone enforcement, multi-format content |
| Growth Analyst | Quality review, SEO analysis, performance optimization |

Agents communicate via `MESSAGE_AGENT` directives, delegate tasks to each other, and share context through project memory.

### 15 Built-in Tools

| Tool | What it does |
|------|-------------|
| `web_search` | Research any topic on the web |
| `memory_store` / `memory_recall` | Read/write project memory (FTS5) |
| `vector_memory_store` / `vector_memory_search` | Semantic vector memory |
| `write_artifact` | Produce deliverable files attached to tasks |
| `create_task` | Programmatically create tasks with assignees |
| `delegate_task` | Delegate work to other agents |
| `read_ideas` / `write_idea` | Access and write to the Idea Stream |
| `twitter_scrape` | Fetch tweets and profiles — no API key |
| `tweet_discover` | Keyword-based tweet discovery via DuckDuckGo |
| `tweet_tracker` | Monitor tweet growth with burst detection |
| `twitter_profile_analyzer` | Profile engagement and content analysis |
| `twitter_post` | Post tweets via OAuth 2.0 |
| `firecrawl_scrape` | Scrape web pages to clean markdown |

### Twitter/X Integration

**Reading** (no API key): Uses FxTwitter public API and DuckDuckGo for tweet data and discovery. Zero cost.

**Posting** (OAuth 2.0): Users connect their Twitter account once in Settings. Agents post on their behalf.

### Auto-Research

Agents can autonomously research trending content, competitor activity, and industry news — then save findings directly to the Idea Stream using the `write_idea` tool. Schedule recurring research tasks via cron (e.g., daily at 9 AM).

### Brand Memory Isolation

Each project has its own brand profile, tone rules, and long-term memory. Nothing leaks between brands. Agents learn from human feedback and improve over time.

### Idea Stream

Inspiration inbox with types (note, article, quote, image), tagging, full-text search, and optional auto-trigger for campaign pipelines.

### Task Board (Kanban)

Inbox → In Progress → Review → Done. Assign tasks to agents, set recurring schedules, view calendar, comment to re-trigger agents, score artifacts (1-5) to train memory.

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm

### Backend

```bash
cd backend
pnpm install
cp .env.example .env   # add at least one AI provider key
pnpm dev               # http://localhost:8787
```

### Frontend

```bash
cd app
pnpm install
cp .env.example .env   # add your API credentials
pnpm dev               # http://localhost:3000
```

---

## Usage

### Create a Project

Create a project with a brand profile (name, tagline, audience, tone keywords, colors). This becomes the identity for all agents working on this project.

### Run a Campaign

1. Go to **Campaigns** → choose a template (or create your own)
2. Agents execute each step autonomously
3. Content that scores 4+ auto-advances; low scores auto-retry
4. When retries are exhausted, content surfaces for human review

### Schedule Auto-Research

Create a recurring task like "Research trending AI marketing content" with a cron schedule. Agents will run the task, use `web_search`, `twitter_scrape`, and `tweet_discover` tools, then save findings to the Idea Stream via `write_idea`.

### Connect Twitter/X

1. Create an app at [developer.x.com](https://developer.x.com)
2. Enable OAuth 2.0 with **Read and write** permissions, type **Web App**
3. Set callback URL: `http://localhost:8787/auth/twitter/callback`
4. Add Client ID + Client Secret to `.env`
5. Users connect via **Settings → Connect Twitter**

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Frontend (Next.js 16 + React 19)      │
│  Dashboard · Board · Campaigns · Ideas          │
│  Analytics · Agents · Settings · Docs           │
└──────────────────────┬──────────────────────────┘
                       │ REST + SSE
                       ▼
┌─────────────────────────────────────────────────┐
│           Agent Gateway (Express)               │
│  50+ endpoints · SSE streaming · OAuth 2.0      │
└────┬──────────────┬──────────────┬──────────────┘
     │              │              │
     ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────────┐
│ Pipeline │  │  Agent   │  │    Cron      │
│  Engine  │  │ Runtime  │  │  Scheduler   │
│ multi-   │  │ 4-iter   │  │  campaign    │
│ step     │  │ tool     │  │  triggers    │
│ campaigns│  │ loop     │  │              │
└────┬─────┘  └────┬─────┘  └──────────────┘
     │             │
     ▼             ▼
┌─────────────────────────────────────────────────┐
│              Data Layer                         │
│  SQLite (per-user isolation) · FTS5 search      │
│  Vector embeddings · File-based workspaces      │
│  22 tables · Brand profiles · Memory layers     │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

- **One gateway** handles all endpoints (projects, tasks, agents, campaigns, ideas, OAuth)
- **Per-user SQLite** — complete data isolation between accounts
- **File-based agent workspaces** — `IDENTITY.md`, `BRAND.md`, `SOUL.md`, `MEMORY.md` provide persistent identity
- **Multi-provider AI** — OpenAI, Anthropic, Kimi with automatic failover
- **No Twitter API keys for reading** — FxTwitter + DuckDuckGo for zero-cost tweet data

---

## Installation

### Backend Environment Variables

```bash
# Required: at least one AI provider
OPENAI_API_KEY=sk-...
PORT=8787
CORS_ORIGINS=http://localhost:3000

# Optional: Twitter/X posting
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret
TWITTER_CALLBACK_URL=http://localhost:8787/auth/twitter/callback
```

### Frontend Environment Variables

No additional environment variables required for frontend.

See `.env.example` in each directory for all available options.

---

## Configuration

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend Runtime | Node.js 20+ (ESM), TypeScript 5.3 strict |
| Backend Framework | Express 4.18 |
| Database | SQLite with FTS5 + vector embeddings |
| AI Providers | OpenAI, Anthropic, Kimi (auto-failover) |
| Frontend Framework | Next.js 16 (App Router), React 19 |
| Frontend Styling | Tailwind CSS v4, Lucide icons |
| Auth | Local user (no auth required) |

### Repository Layout

```
├── app/                        # Next.js frontend
│   ├── app/                    # Pages: dashboard, boards, campaigns,
│   │                           #   ideas, agents, analytics, settings, docs
│   ├── components/             # UI: campaigns, layouts, modals, auth
│   └── lib/api/                # API clients
│
├── backend/                    # Express gateway + agent runtime
│   └── src/
│       ├── gateway/            # HTTP server (50+ endpoints + OAuth)
│       ├── agent/              # Orchestrator, loop, prompt builder
│       ├── pipeline/           # Campaign engine, self-review
│       ├── tools/builtin/      # 15 built-in tools
│       ├── memory/             # Memory read/write with provenance
│       ├── workspace/          # File-based agent workspaces
│       ├── providers/          # OpenAI, Anthropic, Kimi adapters
│       ├── database/           # SQLite with user isolation
│       ├── cron/               # Scheduled job runner
│       └── observability/      # Event tracing
│
├── CLAUDE.md                   # Coding standards
└── AGENTS.md                   # Agent protocol spec
```

### Database (22 tables)

| Table | Purpose |
|-------|---------|
| `users` | User accounts (local storage) |
| `projects` | Brand/project registry |
| `agents` | AI agents per project |
| `tasks` | Marketing tasks with status and recurring support |
| `task_activity` | Activity log per task |
| `task_artifacts` | Deliverable files produced by agents |
| `memories` / `memories_fts` | Per-project memory with FTS5 search |
| `memory_vectors` | Vector embeddings for semantic search |
| `ideas` / `ideas_fts` | Inspiration inbox with FTS5 search |
| `brand_profiles` | Structured brand identity per project |
| `content_feedback` | Human feedback on artifacts (score 1-5) |
| `campaign_templates` | Reusable multi-step campaign definitions |
| `campaign_runs` / `campaign_step_results` | Campaign execution and step tracking |
| `twitter_connections` | OAuth 2.0 tokens for connected X accounts |
| `sessions` | Agent conversation sessions |
| `workspace_metadata` | Workspace config |
| `agent_traces` | Observability event log |
| `cron_jobs` / `cron_runs` | Scheduled jobs and execution history |
| `heartbeats` | Instance health records |

---

## License

MIT
