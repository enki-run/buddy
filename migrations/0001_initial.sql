-- nodes: unified content model (replaces knowledge, documents, memories, variables, skills)
CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('concept', 'fact', 'decision', 'template', 'secret', 'config')),
  title       TEXT NOT NULL,
  content     TEXT,
  tags        TEXT,
  context     TEXT CHECK (context IN ('ifp-labs', 'bemodi', 'dev', 'musik', 'privat')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'draft')),
  encrypted   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_context ON nodes(context);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);

-- edges: explicit relationships between entities
CREATE TABLE IF NOT EXISTS edges (
  id          TEXT PRIMARY KEY,
  from_type   TEXT NOT NULL CHECK (from_type IN ('node', 'project', 'task')),
  from_id     TEXT NOT NULL,
  to_type     TEXT NOT NULL CHECK (to_type IN ('node', 'project', 'task')),
  to_id       TEXT NOT NULL,
  relation    TEXT NOT NULL CHECK (relation IN ('depends_on', 'relates_to', 'supersedes', 'documented_by', 'deployed_on', 'implements', 'produced_by')),
  note        TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE(from_type, from_id, to_type, to_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_type, to_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);

-- projects: workflow containers
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  context     TEXT CHECK (context IN ('ifp-labs', 'bemodi', 'dev', 'musik', 'privat')),
  status      TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'paused', 'done', 'archived')),
  template    TEXT,
  repo        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- tasks: workflow items (includes recurring, replaces actions)
CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority      TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  due_date      TEXT,
  tags          TEXT,
  is_milestone  INTEGER NOT NULL DEFAULT 0,
  recurring     TEXT CHECK (recurring IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  context       TEXT CHECK (context IN ('ifp-labs', 'bemodi', 'dev', 'musik', 'privat')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON tasks(recurring);

-- activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  summary     TEXT,
  ip_hash     TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
