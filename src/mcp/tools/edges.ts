import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EdgeService } from "../../services/edge";
import { ENTITY_TYPES, RELATIONS, LIMITS } from "../../types";

interface EdgeToolDeps {
  edge: EdgeService;
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

export function registerEdgeTools(server: McpServer, deps: EdgeToolDeps) {
  const { edge } = deps;

  // ── link_nodes ───────────────────────────────────────────────
  server.tool(
    "link_nodes",
    "Create a typed edge between two entities. Validates against the edge validation matrix.",
    {
      from_type: z.enum(ENTITY_TYPES).describe("Source entity type"),
      from_id: z.string().describe("Source entity ID"),
      to_type: z.enum(ENTITY_TYPES).describe("Target entity type"),
      to_id: z.string().describe("Target entity ID"),
      relation: z.enum(RELATIONS).describe("Relation type (e.g. depends_on, relates_to, supersedes)"),
      note: z.string().max(LIMITS.NOTE_MAX).optional().describe("Optional note describing the relationship"),
    },
    async (params) => {
      try {
        const result = await edge.link(params);
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── get_related ──────────────────────────────────────────────
  server.tool(
    "get_related",
    "Get all entities related to a given entity via edges. Returns edges with resolved entities.",
    {
      entity_type: z.enum(ENTITY_TYPES).describe("Entity type to query from"),
      entity_id: z.string().describe("Entity ID"),
      relation: z.enum(RELATIONS).optional().describe("Filter by relation type"),
      direction: z.enum(["incoming", "outgoing", "both"]).optional().describe("Edge direction filter (default: both)"),
      limit: z.number().min(1).max(LIMITS.PAGINATION_MAX).default(LIMITS.PAGINATION_DEFAULT).optional(),
      offset: z.number().min(0).default(0).optional(),
    },
    { readOnlyHint: true },
    async (params) => {
      try {
        const result = await edge.getRelated({
          entity_type: params.entity_type,
          entity_id: params.entity_id,
          relation: params.relation,
          direction: params.direction,
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
