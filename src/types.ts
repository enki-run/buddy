// === Environment ===
export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  BUDDY_TOKEN: string;
  BUDDY_TOKEN_PREVIOUS?: string;
  ACTIVITY_LOG_RETENTION_DAYS?: string;
  CORS_ORIGIN?: string;
}

// === Constants ===
export const VERSION = "3.0.0";

export const CONTEXTS = ["ifp-labs", "bemodi", "dev", "musik", "privat"] as const;
export type Context = (typeof CONTEXTS)[number];

export const NODE_TYPES = ["concept", "fact", "decision", "template", "secret", "config"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_STATUSES = ["active", "deprecated", "draft"] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const PROJECT_STATUSES = ["planning", "active", "paused", "done", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = ["backlog", "todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RECURRING_INTERVALS = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

export const ENTITY_TYPES = ["node", "project", "task"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const RELATIONS = [
  "depends_on", "relates_to", "supersedes", "documented_by",
  "deployed_on", "implements", "produced_by"
] as const;
export type Relation = (typeof RELATIONS)[number];

// === Validation Matrix ===
// true = allowed, undefined/false = not allowed
export const EDGE_VALIDATION_MATRIX: Record<Relation, Partial<Record<string, boolean>>> = {
  depends_on:    { "node->node": true },
  relates_to:    { "node->node": true, "project->node": true, "node->project": true, "task->node": true, "node->task": true },
  supersedes:    { "node->node": true },
  documented_by: { "node->node": true, "project->node": true },
  deployed_on:   { "node->node": true },
  implements:    { "node->node": true },
  produced_by:   { "node->node": true, "task->node": true },
};

// === Input Limits ===
export const LIMITS = {
  TITLE_MAX: 500,
  CONTENT_MAX: 102_400, // 100 KB
  NOTE_MAX: 1_000,
  SUMMARY_MAX: 500,
  DESCRIPTION_MAX: 10_240, // 10 KB
  TAGS_MAX_COUNT: 20,
  TAG_MAX_LENGTH: 50,
  PAGINATION_DEFAULT: 50,
  PAGINATION_MAX: 200,
  BULK_TASKS_MAX: 50,
};

// === Interfaces ===
export interface Node {
  id: string;
  type: NodeType;
  title: string;
  content: string | null;
  tags: string | null;
  context: Context | null;
  status: NodeStatus;
  encrypted: number;
  created_at: string;
  updated_at: string;
}

export interface Edge {
  id: string;
  from_type: EntityType;
  from_id: string;
  to_type: EntityType;
  to_id: string;
  relation: Relation;
  note: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  context: Context | null;
  status: ProjectStatus;
  template: string | null;
  repo: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  tags: string | null;
  is_milestone: number;
  recurring: RecurringInterval | null;
  context: Context | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Activity {
  id: string;
  project_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string | null;
  ip_hash: string | null;
  created_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  has_more: boolean;
  total: number;
  limit: number;
  offset: number;
}

export interface HealthFactors {
  momentum: number;
  deadlines: number;
  freshness: number;
}

export interface HealthScore {
  score: string;
  points: number;
  factors: HealthFactors;
}

export interface ContextLoadResult {
  version: string;
  projects: { id: string; name: string; context: Context | null; status: ProjectStatus; health: HealthScore | null }[];
  tasks_attention: { id: string; title: string; project_name: string | null; status: TaskStatus; due_date: string | null }[];
  drafts: { id: string; title: string; type: NodeType; updated_at: string }[];
  skills: { name: string; description: string | null }[];
  recent_activity: { action: string; summary: string | null; created_at: string }[];
  stats: { nodes: number; projects: number; tasks_open: number; edges: number };
  hint?: string;
}

export interface IntegrityReport {
  valid: number;
  orphaned: Edge[];
  invalid: Edge[];
}

export interface ErrorResponse {
  error: {
    code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "ENCRYPTION_ERROR" | "INTERNAL_ERROR";
    message: string;
    details?: Record<string, unknown>;
  };
}
