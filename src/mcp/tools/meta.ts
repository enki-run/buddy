import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ContextService } from "../../services/context";
import type { NodeService } from "../../services/node";
import type { TaskService } from "../../services/task";
import type { ActivityService } from "../../services/activity";
import { CONTEXTS, LIMITS } from "../../types";
import type { Node } from "../../types";

interface MetaToolDeps {
  context: ContextService;
  node: NodeService;
  task: TaskService;
  activity: ActivityService;
  db: D1Database;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function serviceError(err: { code: string; message: string; details?: unknown }) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: { code: err.code, message: err.message, details: err.details } }) }],
    isError: true as const,
  };
}

export function registerMetaTools(server: McpServer, deps: MetaToolDeps) {
  const { context, node, task, activity, db } = deps;

  // ── context_load ─────────────────────────────────────────────
  server.tool(
    "context_load",
    "Load the full context: active projects, attention tasks, drafts, skills catalog, recent activity, and stats. Call this at the start of every conversation.",
    {},
    { readOnlyHint: true },
    async () => {
      try {
        const result = await context.load();
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── capture_summary ──────────────────────────────────────────
  server.tool(
    "capture_summary",
    "Capture a knowledge summary from the current conversation. Creates a node of the given type.",
    {
      title: z.string().max(LIMITS.TITLE_MAX).describe("Summary title"),
      content: z.string().max(LIMITS.CONTENT_MAX).describe("Summary content"),
      type: z.enum(["concept", "fact", "decision"]).default("concept").optional().describe("Node type (default: concept)"),
      context: z.enum(CONTEXTS).optional(),
      tags: z.array(z.string().max(LIMITS.TAG_MAX_LENGTH)).max(LIMITS.TAGS_MAX_COUNT).optional(),
    },
    async (params) => {
      try {
        const result = await node.save({
          type: params.type ?? "concept",
          title: params.title,
          content: params.content,
          tags: params.tags,
          context: params.context,
        });
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── capture_inbox ────────────────────────────────────────────
  server.tool(
    "capture_inbox",
    "Quick-capture a thought into the task inbox as a backlog task. No project association needed.",
    {
      text: z.string().max(LIMITS.TITLE_MAX).describe("Inbox item text"),
    },
    async (params) => {
      try {
        const result = await task.create({
          title: params.text,
        });
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── get_activity ─────────────────────────────────────────────
  server.tool(
    "get_activity",
    "Get the activity log. Optionally filter by project.",
    {
      project_id: z.string().optional(),
      limit: z.number().min(1).max(LIMITS.PAGINATION_MAX).default(LIMITS.PAGINATION_DEFAULT).optional(),
      offset: z.number().min(0).default(0).optional(),
    },
    { readOnlyHint: true },
    async (params) => {
      try {
        const result = await activity.list({
          project_id: params.project_id,
          limit: params.limit ?? LIMITS.PAGINATION_DEFAULT,
          offset: params.offset ?? 0,
        });
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── load_skill ───────────────────────────────────────────────
  server.tool(
    "load_skill",
    "Load a skill/template by name. First tries exact title match, then FTS5 search.",
    {
      name: z.string().describe("Skill name to search for"),
    },
    { readOnlyHint: true },
    async (params) => {
      try {
        // 1. Exact match
        const exact = await db
          .prepare(
            "SELECT * FROM nodes WHERE type = 'template' AND status = 'active' AND title = ? LIMIT 1",
          )
          .bind(params.name)
          .first<Node>();

        if (exact) {
          return ok(exact);
        }

        // 2. FTS5 fallback
        const ftsResult = await db
          .prepare(
            `SELECT n.* FROM nodes n
             JOIN nodes_fts f ON n.rowid = f.rowid
             WHERE nodes_fts MATCH ? AND n.type = 'template' AND n.status = 'active'
             ORDER BY rank
             LIMIT 1`,
          )
          .bind(params.name)
          .first<Node>();

        if (ftsResult) {
          return ok(ftsResult);
        }

        // 3. Not found
        return serviceError({
          code: "NOT_FOUND",
          message: `No skill found matching '${params.name}'`,
        });
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );
}
