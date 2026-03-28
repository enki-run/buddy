# MCP Tools Reference

buddy exposes 25 MCP tools grouped into five categories. All tools communicate over Streamable HTTP at `/mcp`.

## Tool Annotations

| Annotation | Meaning | Tools |
|---|---|---|
| `readOnlyHint` | No side effects, safe to call freely | `get_node`, `list_nodes`, `search_nodes`, `get_related`, `list_projects`, `get_project`, `list_tasks`, `get_activity`, `context_load`, `load_skill` |
| `destructiveHint` | Permanently deletes data | `delete_node` |
| `idempotentHint` | Calling multiple times has the same result | `update_node`, `update_project`, `update_task`, `complete_task`, `move_task` |

## Error Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Relation 'deployed_on' is not allowed between task and node",
    "details": { "from_type": "task", "to_type": "node", "relation": "deployed_on" }
  }
}
```

Error codes: `NOT_FOUND` · `VALIDATION_ERROR` · `CONFLICT` · `ENCRYPTION_ERROR` · `INTERNAL_ERROR`

## Pagination

All list tools return paginated results:

```json
{
  "data": [...],
  "has_more": true,
  "total": 247,
  "limit": 50,
  "offset": 0
}
```

Default limit: 50. Maximum: 200.

---

## Nodes (6 tools)

### `save_node`

Create a new knowledge node. For `secret` nodes, content is AES-256-GCM encrypted at rest.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `type` | `concept` \| `fact` \| `decision` \| `template` \| `secret` \| `config` | Yes | Node type |
| `title` | string (max 500) | Yes | Node title |
| `content` | string (max 100 KB) | No | Node content (markdown supported) |
| `tags` | string[] (max 20 items, each max 50 chars) | No | Tags for categorisation |
| `context` | `ifp-labs` \| `bemodi` \| `dev` \| `musik` \| `privat` | No | Organisational context |

**Returns:** Node object

**Example:**
```json
{
  "type": "decision",
  "title": "ADR-001: Use D1 for persistence",
  "content": "## Decision\nWe use Cloudflare D1...",
  "tags": ["architecture", "database"],
  "context": "dev"
}
```

---

### `get_node`

Retrieve a single node by ID. Secrets are automatically decrypted.

**Annotations:** `readOnlyHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Node ID (ULID) |

**Returns:** Node object with decrypted content if `type: secret`

---

### `update_node`

Update an existing node's fields. Only provided fields are changed.

**Annotations:** `idempotentHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Node ID (ULID) |
| `type` | NodeType | No | Change node type |
| `title` | string (max 500) | No | New title |
| `content` | string (max 100 KB) | No | New content |
| `tags` | string[] | No | Replace tags |
| `context` | Context | No | Change context |
| `status` | `active` \| `deprecated` \| `draft` | No | Change status |

**Returns:** Updated Node object

---

### `delete_node`

Permanently delete a node and all its edges. Uses `db.batch()` for atomic execution.

**Annotations:** `destructiveHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Node ID (ULID) |

**Returns:** `{ "deleted": true, "id": "..." }`

---

### `list_nodes`

List nodes with optional filters by type, context, tags, and status.

**Annotations:** `readOnlyHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `type` | NodeType | No | Filter by type |
| `context` | Context | No | Filter by context |
| `tags` | string[] | No | Filter by tags (AND logic) |
| `status` | NodeStatus | No | Filter by status |
| `limit` | number (1–200) | No | Page size (default: 50) |
| `offset` | number | No | Pagination offset (default: 0) |

**Returns:** `PaginatedResult<Node>`

---

### `search_nodes`

Full-text search across nodes using FTS5. Returns ranked results.

**Annotations:** `readOnlyHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search query (FTS5 syntax) |
| `type` | NodeType | No | Restrict to type |
| `context` | Context | No | Restrict to context |
| `limit` | number (1–200) | No | Page size (default: 50) |
| `offset` | number | No | Pagination offset (default: 0) |

**Returns:** `PaginatedResult<Node>`

**Example:** `{ "query": "agent mesh NATS", "type": "concept" }`

---

## Edges (2 tools)

### `link_nodes`

Create a typed edge between two entities. Validates against the edge validation matrix before inserting. Returns `CONFLICT` if the same edge already exists.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `from_type` | `node` \| `project` \| `task` | Yes | Source entity type |
| `from_id` | string | Yes | Source entity ID |
| `to_type` | `node` \| `project` \| `task` | Yes | Target entity type |
| `to_id` | string | Yes | Target entity ID |
| `relation` | see matrix below | Yes | Relation type |
| `note` | string (max 1000) | No | Optional description of the relationship |

**Validation Matrix:**

| Relation | node→node | project→node | node→project | task→node | node→task |
|---|:---:|:---:|:---:|:---:|:---:|
| `depends_on` | Y | — | — | — | — |
| `relates_to` | Y | Y | Y | Y | Y |
| `supersedes` | Y | — | — | — | — |
| `documented_by` | Y | Y | — | — | — |
| `deployed_on` | Y | — | — | — | — |
| `implements` | Y | — | — | — | — |
| `produced_by` | Y | — | — | Y | — |

Invalid combinations return `VALIDATION_ERROR` (400).

**Returns:** Edge object

**Example:**
```json
{
  "from_type": "node",
  "from_id": "01JXXXXXXXXXXXXXXXXXXXXXXXXX",
  "to_type": "node",
  "to_id": "01JYYYYYYYYYYYYYYYYYYYYYYYYY",
  "relation": "depends_on",
  "note": "Agent Mesh requires NATS for message routing"
}
```

---

### `get_related`

Get all entities related to a given entity via edges. Returns edges with resolved entity objects.

**Annotations:** `readOnlyHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `entity_type` | `node` \| `project` \| `task` | Yes | Entity type to query from |
| `entity_id` | string | Yes | Entity ID |
| `relation` | Relation | No | Filter by relation type |
| `direction` | `incoming` \| `outgoing` \| `both` | No | Edge direction (default: both) |
| `limit` | number (1–200) | No | Page size (default: 50) |
| `offset` | number | No | Pagination offset (default: 0) |

**Returns:** `PaginatedResult<{ entity, edges }>`

---

## Projects (5 tools)

### `init_project`

Create a new project. Always call `list_projects` first to check for duplicates.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `name` | string (max 500) | Yes | Project name |
| `context` | Context | No | Organisational context |
| `description` | string (max 10 KB) | No | Project description |
| `template` | string | No | Template name to initialise from |
| `repo` | string | No | Git repository (e.g. `org/repo-name`) |

**Returns:** Project object

---

### `list_projects`

List all projects with optional filters. Use before `init_project` to check for duplicates.

**Annotations:** `readOnlyHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `context` | Context | No | Filter by context |
| `status` | `planning` \| `active` \| `paused` \| `done` \| `archived` | No | Filter by status |
| `limit` | number (1–200) | No | Page size (default: 50) |
| `offset` | number | No | Pagination offset (default: 0) |

**Returns:** `PaginatedResult<Project>`

---

### `get_project`

Get a single project by ID, including related nodes connected via edges.

**Annotations:** `readOnlyHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Project ID (ULID) |

**Returns:** Project object + `related_nodes` array (nodes linked via `documented_by` or `relates_to`)

---

### `update_project`

Update an existing project's fields. Only provided fields are changed.

**Annotations:** `idempotentHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Project ID (ULID) |
| `name` | string (max 500) | No | New name |
| `description` | string (max 10 KB) | No | New description |
| `context` | Context | No | Change context |
| `status` | ProjectStatus | No | Change status |
| `repo` | string | No | Update repository |

**Returns:** Updated Project object

---

### `archive_project`

Archive a project. Edges are preserved — archived projects remain as reference points in the graph. This does not delete the project.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Project ID (ULID) |

**Returns:** Updated Project object (status: `archived`)

---

## Tasks (7 tools)

### `create_task`

Create a new task.

- For **recurring jobs** (e.g. "Check SSL certificates monthly"): use `recurring` + `context`, omit `project_id`.
- For **project tasks** (e.g. "Design API schema"): use `project_id`, omit `recurring`.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `title` | string (max 500) | Yes | Task title |
| `project_id` | string | No | Project ID to attach to |
| `description` | string (max 10 KB) | No | Task description |
| `priority` | `critical` \| `high` \| `medium` \| `low` | No | Priority (default: medium) |
| `due_date` | string | No | Due date (YYYY-MM-DD) |
| `tags` | string[] | No | Tags |
| `recurring` | `weekly` \| `monthly` \| `quarterly` \| `yearly` | No | Recurring interval |
| `context` | Context | No | Organisational context |

**Returns:** Task object

---

### `list_tasks`

List tasks with optional filters. Results are sorted by priority then due date.

**Annotations:** `readOnlyHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `project_id` | string | No | Filter by project |
| `status` | `backlog` \| `todo` \| `in_progress` \| `blocked` \| `done` \| `cancelled` | No | Filter by status |
| `priority` | Priority | No | Filter by priority |
| `context` | Context | No | Filter by context |
| `tag` | string | No | Filter by single tag |
| `limit` | number (1–200) | No | Page size (default: 50) |
| `offset` | number | No | Pagination offset (default: 0) |

**Returns:** `PaginatedResult<Task>`

---

### `update_task`

Update an existing task's fields. Only provided fields are changed.

**Annotations:** `idempotentHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Task ID (ULID) |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `status` | TaskStatus | No | Change status |
| `priority` | Priority | No | Change priority |
| `due_date` | string | No | New due date (YYYY-MM-DD) |
| `tags` | string[] | No | Replace tags |
| `project_id` | string | No | Move to different project |
| `recurring` | RecurringInterval | No | Set or change recurrence |
| `context` | Context | No | Change context |

**Returns:** Updated Task object

---

### `complete_task`

Mark a task as done. Optionally link a result node — if `result_node_id` is provided, a `produced_by` edge is automatically created between the task and the node.

**Annotations:** `idempotentHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Task ID (ULID) |
| `result_node_id` | string | No | ID of a node produced by this task |

**Returns:** Updated Task object. If `result_node_id` points to a non-existent node, returns `NOT_FOUND` but the task is still marked done.

---

### `move_task`

Move a task to a different project.

**Annotations:** `idempotentHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Task ID (ULID) |
| `project_id` | string | Yes | Target project ID |

**Returns:** Updated Task object

---

### `bulk_create_tasks`

Create up to 50 tasks in a single atomic batch. All-or-nothing — if any task fails validation, none are created.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `tasks` | TaskDefinition[] (1–50) | Yes | Array of task definitions |

Each task definition has the same fields as `create_task`.

**Returns:** `{ "created": 5, "tasks": [...] }`

---

### `complete_recurring_task`

Complete a recurring task and automatically create the next occurrence with the calculated due date.

- `weekly` → next due date = current due date + 7 days
- `monthly` → + 1 month
- `quarterly` → + 3 months
- `yearly` → + 1 year

Returns `VALIDATION_ERROR` if the task has no `recurring` field.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Recurring task ID (ULID) |

**Returns:** `{ "completed": Task, "next": Task }`

---

## Meta (5 tools)

### `context_load`

Load the full workspace context. Call this at the start of every conversation. Returns a compact summary optimised for token efficiency — no content, only metadata.

**Annotations:** `readOnlyHint`

**Parameters:** None

**Returns:**

```json
{
  "version": "3.0.0",
  "projects": [{ "id", "name", "context", "status", "health" }],
  "tasks_attention": [{ "id", "title", "project_name", "status", "due_date" }],
  "drafts": [{ "id", "title", "type", "updated_at" }],
  "skills": [{ "name", "description" }],
  "recent_activity": [{ "action", "summary", "created_at" }],
  "stats": { "nodes", "projects", "tasks_open", "edges" },
  "hint": "optional hint for empty state"
}
```

- `projects`: active projects only, no descriptions
- `tasks_attention`: overdue + in_progress + blocked (max 10)
- `drafts`: nodes with `status: draft` (max 5)
- `skills`: all `template` nodes — name and description only (use `load_skill` for full content)
- `recent_activity`: last 5 entries
- `health`: letter grade A–F, `null` if no tasks exist

---

### `capture_summary`

Capture a knowledge summary from the current conversation as a new node.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `title` | string (max 500) | Yes | Summary title |
| `content` | string (max 100 KB) | Yes | Summary content |
| `type` | `concept` \| `fact` \| `decision` | No | Node type (default: concept) |
| `context` | Context | No | Organisational context |
| `tags` | string[] | No | Tags |

**Returns:** Created Node object

---

### `capture_inbox`

Quick-capture a thought into the task inbox as a backlog task. No project association needed.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` | string (max 500) | Yes | Inbox item text |

**Returns:** Created Task object (status: backlog, no project)

---

### `get_activity`

Get the activity log. Optionally filter by project.

**Annotations:** `readOnlyHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `project_id` | string | No | Filter to a specific project |
| `limit` | number (1–200) | No | Page size (default: 50) |
| `offset` | number | No | Pagination offset (default: 0) |

**Returns:** `PaginatedResult<Activity>`

---

### `load_skill`

Load a skill/template by name. First tries exact title match on `type: template` + `status: active` nodes, then falls back to FTS5 search. Returns the best match.

**Annotations:** `readOnlyHint`

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Skill name to search for |

**Returns:** Node object (type: template) with full content, or `NOT_FOUND` error.

**Example:** `{ "name": "5-whys" }` → returns the 5-Whys template node with full markdown content.
