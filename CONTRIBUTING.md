# Contributing to buddy

## Architecture Overview

buddy is a Cloudflare Worker built with [Hono](https://hono.dev/). There are three layers:

```
HTTP Request
    │
    ▼
src/index.tsx          — Hono app, all routes, security headers
    │
    ├── /mcp           — MCP server (Streamable HTTP, stateless per request)
    │       └── src/mcp/server.ts
    │               └── src/mcp/tools/
    │                       nodes.ts     — 6 tools
    │                       edges.ts     — 2 tools
    │                       projects.ts  — 5 tools
    │                       tasks.ts     — 7 tools
    │                       meta.ts      — 5 tools
    │
    └── /*, /nodes, /project/:id, ...   — Server-rendered dashboard (Hono JSX)
                └── src/views/
                        layout.tsx, home.tsx, nodes.tsx, node.tsx,
                        project.tsx, graph.tsx, timeline.tsx,
                        activity.tsx, login.tsx, not-found.tsx
```

Each MCP tool file calls into a **service**. Services own all DB logic:

```
src/services/
  node.ts        — CRUD + FTS5 + AES-256-GCM encryption for secrets
  edge.ts        — link/unlink + validation matrix + get_related
  integrity.ts   — graph integrity check (orphaned + invalid edges)
  project.ts     — CRUD + related nodes via EdgeService
  task.ts        — CRUD + recurring + complete with result_node linkage
  health.ts      — health score (momentum 35% + deadlines 35% + freshness 30%)
  activity.ts    — activity log + security events
  search.ts      — unified search (FTS5 for nodes, LIKE for projects/tasks)
  stats.ts       — counts across all tables (cached via KV, 60s TTL)
  context.ts     — context_load logic (5 parallel D1 queries, KV-cached)
  cache.ts       — KV cache wrapper: get / set / invalidate with TTL
```

Cross-cutting concerns:

```
src/auth.ts    — Cookie + Bearer auth, CSRF, timing-safe comparison, IP hashing
src/oauth.ts   — OAuth 2.1 (PKCE enforced, stateless HMAC codes)
src/types.ts   — All interfaces, enums, constants, validation matrix
src/markdown.ts — marked + highlight.js + sanitize-html (XSS-safe rendering)
```

## Dev Setup

Prerequisites: Node.js 20+, a Cloudflare account, `wrangler` CLI.

```bash
# Clone and install
git clone git@github.com:enki-run/buddy.git
cd buddy
npm install

# Configure
cp wrangler.toml.example wrangler.toml
cp .env.example .dev.vars
# Edit .dev.vars and set BUDDY_TOKEN (or use the default 'dev' for local testing)

# Create local D1 and KV
wrangler d1 create buddy              # copy database_id to your wrangler.toml
wrangler kv namespace create CACHE    # copy id to your wrangler.toml
npm run migrate:local                 # apply migrations to local D1

# Run tests
npm test

# Start dev server (local D1, hot reload)
npm run dev
```

The dev server runs at `http://localhost:8787`. Use `BUDDY_TOKEN=dev` in `.dev.vars`:

```ini
# .dev.vars (never commit this file)
BUDDY_TOKEN=dev
```

## Running Tests

```bash
npm test          # run once
npm run test:watch  # watch mode
```

Tests use `@cloudflare/vitest-pool-workers` which runs code inside a real Workers runtime (no mocking of D1 or KV). Tests live in `tests/`.

## Adding a New MCP Tool

1. Decide which group it belongs to: `nodes`, `edges`, `projects`, `tasks`, or `meta`.
2. Open the corresponding file in `src/mcp/tools/`.
3. Register the tool with `server.tool(name, description, schema, [annotations], handler)`.
4. If it's read-only, add `{ readOnlyHint: true }`. Destructive → `{ destructiveHint: true }`. Idempotent → `{ idempotentHint: true }`.
5. If the tool needs a new DB operation, add a method to the relevant service in `src/services/`.
6. Add a test in `tests/`.

Example skeleton:

```typescript
server.tool(
  "my_tool",
  "Short description for the LLM.",
  {
    id: z.string().describe("Entity ID (ULID)"),
    // ... more params with .describe() on each
  },
  { readOnlyHint: true }, // or omit if not applicable
  async (params) => {
    try {
      const result = await myService.doSomething(params.id);
      if (!result) return serviceError({ code: "NOT_FOUND", message: `Not found: ${params.id}` });
      return ok(result);
    } catch (err: any) {
      if (err.code) return serviceError(err);
      throw err;
    }
  },
);
```

Always use `.describe()` on every parameter — the MCP client shows these to the LLM.

## Adding a Dashboard View

1. Create `src/views/myview.tsx` exporting a JSX component.
2. Import it in `src/index.tsx` and add a route: `app.get("/myview", ...)`.
3. Wrap the page in `<Layout>` (provides nav, auth, theme).
4. Any user-generated content rendered as HTML **must** be:
   - Markdown: passed through `renderMarkdown()` (uses sanitize-html)
   - Plain text: HTML-escaped with `escapeHtml()`

## Code Conventions

- **Errors from services** throw objects with `{ code, message, details? }`. MCP tool handlers catch these and call `serviceError(err)`.
- **Pagination** — all list endpoints return `{ data, has_more, total, limit, offset }`. Use `LIMITS.PAGINATION_DEFAULT` (50) and `LIMITS.PAGINATION_MAX` (200).
- **IDs** are ULIDs generated by `ulidx`.
- **Timestamps** are ISO 8601 strings (SQLite TEXT).
- **Tags** are stored as JSON arrays (`["api","backend"]`) and queried via `json_each()`.
- **No raw HTML insertion** — every field that reaches the DOM must be escaped or sanitized.
- **db.batch()** for multi-step operations that must be atomic (e.g. delete node + its edges).

## Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add graph view filter by relation type
fix: handle null content in node detail fragment
docs: update mcp-tools.md with complete_recurring_task
chore: upgrade @modelcontextprotocol/sdk to 1.28
refactor: extract validation matrix check into EdgeService
```

## Pull Request Checklist

- [ ] `npm test` passes
- [ ] No new raw HTML insertions without escaping/sanitization
- [ ] New MCP tools have `.describe()` on all parameters
- [ ] New MCP tools have correct annotations (readOnlyHint, destructiveHint, idempotentHint)
- [ ] Any new list endpoint follows pagination conventions
- [ ] CONTRIBUTING.md or docs updated if behavior changes
