-- SQLite Schema for MarketingOS - Per-user storage
-- Each user has isolated data in SQLite with user_id column

-- Users table (synced from Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Supabase user ID
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Memories table - isolated by user_id
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  project_id TEXT,
  session_id TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('core', 'daily', 'conversation', 'custom')),
  layer TEXT NOT NULL DEFAULT 'working' CHECK (layer IN ('brand', 'working', 'long_term')),
  keywords TEXT, -- Space-separated keywords for FTS
  metadata TEXT, -- JSON string
  source TEXT,
  reviewer TEXT,
  content_id TEXT,
  confidence REAL DEFAULT 0.5,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Full-Text Search table (FTS5) - isolated by user_id
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  keywords,
  content_rowid,
  user_id UNINDEXED
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, keywords, user_id)
  VALUES (new.id, new.content, new.keywords, new.user_id);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  DELETE FROM memories_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  UPDATE memories_fts SET 
    content = new.content,
    keywords = new.keywords,
    user_id = new.user_id
  WHERE rowid = old.id;
END;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(user_id, session_id);

-- Vector embeddings table (optional, can be empty if not using embeddings)
CREATE TABLE IF NOT EXISTS memory_vectors (
  memory_id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  vector BLOB, -- SQLite BLOB for vector storage
  dimensions INTEGER DEFAULT 1536,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vectors_user_id ON memory_vectors(user_id);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  data TEXT, -- JSON serialized session data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Workspace metadata table
CREATE TABLE IF NOT EXISTS workspace_metadata (
  user_id TEXT PRIMARY KEY,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
  version TEXT DEFAULT '1.0',
  settings TEXT, -- JSON
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Projects table - isolated by user_id
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- Agents table - isolated by user_id and project_id
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'general',
  skills TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_user_project ON agents(user_id, project_id);

-- Tasks table - isolated by user_id and project_id
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('inbox', 'in-progress', 'review', 'done')),
  priority TEXT NOT NULL CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  labels TEXT, -- JSON array
  assignee_id TEXT,
  reporter_id TEXT,
  task_code TEXT,
  due_date TEXT,
  start_date TEXT,
  cron_expression TEXT,      -- e.g. "0 9 * * 1" for recurring tasks
  is_recurring INTEGER DEFAULT 0,  -- 1 = recurring task
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

-- Task activity log
CREATE TABLE IF NOT EXISTS task_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('agent', 'system', 'user')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task_id ON task_activity(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_project_id ON task_activity(project_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_created_at ON task_activity(created_at DESC);

-- Agent traces (observability)
CREATE TABLE IF NOT EXISTS agent_traces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_traces_user_id ON agent_traces(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_project_id ON agent_traces(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_session_id ON agent_traces(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_agent_id ON agent_traces(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_event_type ON agent_traces(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_traces_created_at ON agent_traces(created_at DESC);

-- Heartbeat table
CREATE TABLE IF NOT EXISTS heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  host TEXT,
  status TEXT NOT NULL,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_instance ON heartbeats(instance_id);

-- Cron scheduler tables
CREATE TABLE IF NOT EXISTS cron_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  project_id TEXT,
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_run_at DATETIME,
  next_run_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(next_run_at);

CREATE TABLE IF NOT EXISTS cron_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  output TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
);

-- Feedback for learning loop
CREATE TABLE IF NOT EXISTS content_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  reviewer TEXT,
  score INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_project_id ON content_feedback(project_id);

-- Task artifacts — files produced by agents during task execution
CREATE TABLE IF NOT EXISTS task_artifacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'markdown',
  size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_artifacts_task_id ON task_artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_task_artifacts_project_id ON task_artifacts(project_id);

-- Ideas table — inspiration inbox
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'note' CHECK (type IN ('note','article','quote','image')),
  tags TEXT,              -- JSON array
  source_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_project_id ON ideas(project_id);
CREATE INDEX IF NOT EXISTS idx_ideas_type ON ideas(type);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at DESC);

-- FTS5 for ideas full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS ideas_fts USING fts5(
  title,
  content,
  tags,
  content_rowid,
  user_id UNINDEXED
);

CREATE TRIGGER IF NOT EXISTS ideas_ai AFTER INSERT ON ideas BEGIN
  INSERT INTO ideas_fts(rowid, title, content, tags, user_id)
  VALUES (new.rowid, new.title, new.content, new.tags, new.user_id);
END;

CREATE TRIGGER IF NOT EXISTS ideas_ad AFTER DELETE ON ideas BEGIN
  DELETE FROM ideas_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS ideas_au AFTER UPDATE ON ideas BEGIN
  UPDATE ideas_fts SET
    title = new.title,
    content = new.content,
    tags = new.tags,
    user_id = new.user_id
  WHERE rowid = old.rowid;
END;

-- Twitter OAuth connections — one per user
CREATE TABLE IF NOT EXISTS twitter_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  twitter_user_id TEXT NOT NULL,
  twitter_username TEXT NOT NULL,
  twitter_display_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at DATETIME NOT NULL,
  scopes TEXT,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_twitter_connections_user_id ON twitter_connections(user_id);

-- Brand profiles — structured brand identity per project
CREATE TABLE IF NOT EXISTS brand_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL UNIQUE,
  name TEXT,
  tagline TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  font_primary TEXT,
  font_secondary TEXT,
  tone_keywords TEXT,       -- JSON array
  target_audience TEXT,
  tone_profile TEXT,
  logo_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_brand_profiles_user_id ON brand_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_project_id ON brand_profiles(project_id);

-- Campaign Templates — reusable multi-step campaign definitions
CREATE TABLE IF NOT EXISTS campaign_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  steps TEXT NOT NULL,                    -- JSON: CampaignStep[]
  schedule TEXT,                          -- Cron: "@weekly", "0 9 * * 1"
  auto_approve_threshold REAL DEFAULT 4.0,
  max_retries INTEGER DEFAULT 2,
  trigger_on_new_idea INTEGER DEFAULT 0,  -- Auto-trigger pipeline when new idea added
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_templates_user_id ON campaign_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_templates_project_id ON campaign_templates(project_id);

-- Campaign Runs — one instance of a template execution
CREATE TABLE IF NOT EXISTS campaign_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','waiting_approval','completed','failed','cancelled')),
  current_step TEXT,
  context TEXT,                           -- JSON: accumulated step outputs
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  trigger_type TEXT DEFAULT 'manual'
    CHECK (trigger_type IN ('manual','cron','idea','webhook')),
  trigger_payload TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES campaign_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_runs_user_id ON campaign_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_runs_project_id ON campaign_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_campaign_runs_template_id ON campaign_runs(template_id);
CREATE INDEX IF NOT EXISTS idx_campaign_runs_status ON campaign_runs(status);

-- Per-step results within a campaign run
CREATE TABLE IF NOT EXISTS campaign_step_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','self_review','waiting_approval','approved','rejected','retrying','failed')),
  self_review_score REAL,
  self_review_reasoning TEXT,
  retry_count INTEGER DEFAULT 0,
  output_summary TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (run_id) REFERENCES campaign_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_step_results_run_id ON campaign_step_results(run_id);
CREATE INDEX IF NOT EXISTS idx_campaign_step_results_status ON campaign_step_results(status);

-- Chat messages — persistent project chat history
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(project_id, session_id, created_at ASC);

-- Migration: add role and skills columns to agents (safe for existing databases)
-- SQLite ALTER TABLE ADD COLUMN is idempotent-safe when wrapped in a check
-- These columns enable role-specific skill assignment per agent

