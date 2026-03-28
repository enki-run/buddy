import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NodeService } from "../../services/node";
import { NODE_TYPES, NODE_STATUSES, CONTEXTS, LIMITS } from "../../types";

interface NodeToolDeps {
  node: NodeService;
  buddyToken: string;
  buddyTokenPrevious?: string;
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

export function registerNodeTools(server: McpServer, deps: NodeToolDeps) {
  const { node, buddyToken, buddyTokenPrevious } = deps;

  // ── save_node ────────────────────────────────────────────────
  server.tool(
    "save_node",
    "Create a new knowledge node (concept, fact, decision, template, secret, config). For secrets, content is encrypted at rest.",
    {
      type: z.enum(NODE_TYPES).describe("Node type"),
      title: z.string().max(LIMITS.TITLE_MAX).describe("Node title"),
      content: z.string().max(LIMITS.CONTENT_MAX).optional().describe("Node content (max 100 KB)"),
      tags: z.array(z.string().max(LIMITS.TAG_MAX_LENGTH)).max(LIMITS.TAGS_MAX_COUNT).optional().describe("Tags for categorisation"),
      context: z.enum(CONTEXTS).optional().describe("Organisational context"),
    },
    async (params) => {
      try {
        const result = await node.save({
          type: params.type,
          title: params.title,
          content: params.content,
          tags: params.tags,
          context: params.context,
          encryptionToken: params.type === "secret" ? buddyToken : undefined,
        });
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── get_node ─────────────────────────────────────────────────
  server.tool(
    "get_node",
    "Retrieve a single node by ID. Secrets are automatically decrypted.",
    {
      id: z.string().describe("Node ID (ULID)"),
    },
    { readOnlyHint: true },
    async (params) => {
      try {
        const result = await node.getById(params.id, {
          current: buddyToken,
          previous: buddyTokenPrevious,
        });
        if (!result) {
          return serviceError({ code: "NOT_FOUND", message: `Node '${params.id}' not found` });
        }
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── update_node ──────────────────────────────────────────────
  server.tool(
    "update_node",
    "Update an existing node's fields. Only provided fields are changed.",
    {
      id: z.string().describe("Node ID (ULID)"),
      type: z.enum(NODE_TYPES).optional(),
      title: z.string().max(LIMITS.TITLE_MAX).optional(),
      content: z.string().max(LIMITS.CONTENT_MAX).optional(),
      tags: z.array(z.string().max(LIMITS.TAG_MAX_LENGTH)).max(LIMITS.TAGS_MAX_COUNT).optional(),
      context: z.enum(CONTEXTS).optional(),
      status: z.enum(NODE_STATUSES).optional(),
    },
    { idempotentHint: true },
    async (params) => {
      try {
        const { id, ...fields } = params;
        const result = await node.update(id, {
          ...fields,
          encryptionToken: buddyToken,
        });
        if (!result) {
          return serviceError({ code: "NOT_FOUND", message: `Node '${id}' not found` });
        }
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── delete_node ──────────────────────────────────────────────
  server.tool(
    "delete_node",
    "Permanently delete a node and all its edges.",
    {
      id: z.string().describe("Node ID (ULID)"),
    },
    { destructiveHint: true },
    async (params) => {
      try {
        const deleted = await node.delete(params.id);
        if (!deleted) {
          return serviceError({ code: "NOT_FOUND", message: `Node '${params.id}' not found` });
        }
        return ok({ deleted: true, id: params.id });
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── list_nodes ───────────────────────────────────────────────
  server.tool(
    "list_nodes",
    "List nodes with optional filters by type, context, tags, and status. Supports pagination.",
    {
      type: z.enum(NODE_TYPES).optional(),
      context: z.enum(CONTEXTS).optional(),
      tags: z.array(z.string()).optional().describe("Filter by tags (AND logic)"),
      status: z.enum(NODE_STATUSES).optional(),
      limit: z.number().min(1).max(LIMITS.PAGINATION_MAX).default(LIMITS.PAGINATION_DEFAULT).optional(),
      offset: z.number().min(0).default(0).optional(),
    },
    { readOnlyHint: true },
    async (params) => {
      try {
        const result = await node.list({
          type: params.type,
          context: params.context,
          tags: params.tags,
          status: params.status,
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

  // ── search_nodes ─────────────────────────────────────────────
  server.tool(
    "search_nodes",
    "Full-text search across nodes (FTS5). Returns ranked results.",
    {
      query: z.string().describe("Search query (FTS5 syntax)"),
      type: z.enum(NODE_TYPES).optional(),
      context: z.enum(CONTEXTS).optional(),
      limit: z.number().min(1).max(LIMITS.PAGINATION_MAX).default(LIMITS.PAGINATION_DEFAULT).optional(),
      offset: z.number().min(0).default(0).optional(),
    },
    { readOnlyHint: true },
    async (params) => {
      try {
        const result = await node.search({
          query: params.query,
          type: params.type,
          context: params.context,
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
}
