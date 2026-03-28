# Graph Integrity

buddy maintains a knowledge graph where nodes, projects, and tasks are connected by typed edges. This document explains the validation rules, how corruption can occur, and how to detect and fix it.

---

## Edge Validation Matrix

Not every relation type is valid between every entity type combination. The matrix below defines what is allowed. Everything not listed is rejected with `VALIDATION_ERROR (400)`.

| Relation | node→node | project→node | node→project | task→node | node→task |
|---|:---:|:---:|:---:|:---:|:---:|
| `depends_on` | Y | — | — | — | — |
| `relates_to` | Y | Y | Y | Y | Y |
| `supersedes` | Y | — | — | — | — |
| `documented_by` | Y | Y | — | — | — |
| `deployed_on` | Y | — | — | — | — |
| `implements` | Y | — | — | — | — |
| `produced_by` | Y | — | — | Y | — |

Validation is enforced in `EdgeService` before the INSERT. The matrix is defined in `src/types.ts` as `EDGE_VALIDATION_MATRIX`.

### Uniqueness Constraint

Only one edge per relation type is allowed between the same two entities. A second `link_nodes` call with the same `from`, `to`, and `relation` returns `CONFLICT (409)`. To annotate a relationship with additional context, update the `note` field on the existing edge.

---

## IntegrityService

`src/services/integrity.ts` exports `IntegrityService.validate()`, which scans all edges and checks:

1. **Matrix validity** — Is the `relation` type allowed for the `from_type → to_type` combination?
2. **Source existence** — Does `from_id` exist in the table corresponding to `from_type`?
3. **Target existence** — Does `to_id` exist in the table corresponding to `to_type`?

Returns:

```typescript
interface IntegrityReport {
  valid:    number;   // count of edges that pass all checks
  orphaned: Edge[];   // edges where source or target no longer exists
  invalid:  Edge[];   // edges that violate the validation matrix
}
```

Access the report via the dashboard API:

```
GET /api/integrity
```

---

## How Orphaned Edges Arise

Under normal operation, orphaned edges should not occur — `delete_node` and task deletion clean up all associated edges atomically via `db.batch()`. However, orphaned edges can arise from:

- **Direct database access** — Deleting a row from `nodes`, `projects`, or `tasks` directly in the D1 console or via SQL without touching the `edges` table.
- **Bugs in service code** — A code path that deletes an entity without calling `db.batch()` for the associated edges.
- **Race conditions** — In theory, two concurrent requests could interleave a delete and an edge creation, though Cloudflare D1's serialized write model makes this unlikely in practice.

Archived projects are **not** considered orphaned — `archive_project` sets `status: archived` but keeps the project row intact, so edges to/from archived projects remain valid references.

---

## db.batch() as Transaction Strategy

D1 does not support SQL transactions in the traditional sense across multiple statements in Workers. buddy uses `db.batch()` (D1 Batched Statements) to execute multiple statements atomically within a single D1 operation. If the batch fails, no statements are applied.

Example — `delete_node` internally runs:

```typescript
await db.batch([
  db.prepare("DELETE FROM nodes WHERE id = ?").bind(id),
  db.prepare("DELETE FROM edges WHERE from_id = ? OR to_id = ?").bind(id, id),
]);
```

This guarantees that a node and its edges are either both deleted or both preserved.

---

## Health Score Impact

The health score for each project is calculated from three factors:

| Factor | Weight | Description |
|---|---|---|
| Momentum | 35% | Fraction of tasks completed in the last 14 days |
| Deadlines | 35% | Ratio of non-overdue to total tasks with due dates |
| Freshness | 30% | Days since last activity (decays to 0 over 30 days) |

Score 0–100 maps to letter grades: **A** (80+) · **B** (60–79) · **C** (40–59) · **D** (20–39) · **F** (0–19)

Orphaned or invalid edges reduce the score proportionally to their share of total edges. A project with 10% orphaned edges receives a proportional integrity deduction on top of the momentum/deadlines/freshness score.

---

## Cleaning Up Integrity Issues

### Finding Issues

```bash
# Via dashboard API
curl -H "Authorization: Bearer <BUDDY_TOKEN>" https://buddy.yourdomain.com/api/integrity
```

The response lists all `orphaned` and `invalid` edges with their full edge objects, including `id`, `from_type`, `from_id`, `to_type`, `to_id`, and `relation`.

### Fixing Orphaned Edges

Orphaned edges can be safely deleted — they reference entities that no longer exist. Delete them directly in D1:

```sql
-- Delete a specific orphaned edge by ID
DELETE FROM edges WHERE id = 'the-edge-id';

-- Or delete all edges where the source node is missing
DELETE FROM edges
WHERE from_type = 'node'
  AND from_id NOT IN (SELECT id FROM nodes);
```

After cleanup, run the integrity check again to confirm the report shows `orphaned: []`.

### Fixing Invalid Edges

Invalid edges violate the validation matrix (e.g. a `depends_on` edge from a project to a node). These should be deleted and, if the relationship is still meaningful, re-created with the correct relation type.

```sql
DELETE FROM edges WHERE id = 'the-invalid-edge-id';
```

Then use `link_nodes` to create the correct edge:

```json
{
  "from_type": "project",
  "from_id": "...",
  "to_type": "node",
  "to_id": "...",
  "relation": "relates_to"
}
```
