import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ProjectService } from "../../services/project";
import { CONTEXTS, PROJECT_STATUSES, LIMITS } from "../../types";

interface ProjectToolDeps {
  project: ProjectService;
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

export function registerProjectTools(server: McpServer, deps: ProjectToolDeps) {
  const { project } = deps;

  // ── init_project ─────────────────────────────────────────────
  server.tool(
    "init_project",
    "Create a new project. Always check list_projects first to avoid duplicates.",
    {
      name: z.string().max(LIMITS.TITLE_MAX).describe("Project name"),
      context: z.enum(CONTEXTS).optional().describe("Organisational context"),
      description: z.string().max(LIMITS.DESCRIPTION_MAX).optional(),
      template: z.string().optional().describe("Template name to initialize from"),
      repo: z.string().optional().describe("Git repository (e.g. org/repo-name)"),
    },
    async (params) => {
      try {
        const result = await project.create(params);
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── list_projects ────────────────────────────────────────────
  server.tool(
    "list_projects",
    "List all projects with optional filters. Use before init_project to check for duplicates.",
    {
      context: z.enum(CONTEXTS).optional(),
      status: z.enum(PROJECT_STATUSES).optional(),
      limit: z.number().min(1).max(LIMITS.PAGINATION_MAX).default(LIMITS.PAGINATION_DEFAULT).optional(),
      offset: z.number().min(0).default(0).optional(),
    },
    { readOnlyHint: true },
    async (params) => {
      try {
        const result = await project.list({
          context: params.context,
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

  // ── get_project ──────────────────────────────────────────────
  server.tool(
    "get_project",
    "Get a single project by ID, including related nodes.",
    {
      id: z.string().describe("Project ID (ULID)"),
    },
    { readOnlyHint: true },
    async (params) => {
      try {
        const result = await project.getById(params.id);
        if (!result) {
          return serviceError({ code: "NOT_FOUND", message: `Project '${params.id}' not found` });
        }
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── update_project ───────────────────────────────────────────
  server.tool(
    "update_project",
    "Update an existing project's fields. Only provided fields are changed.",
    {
      id: z.string().describe("Project ID (ULID)"),
      name: z.string().max(LIMITS.TITLE_MAX).optional(),
      description: z.string().max(LIMITS.DESCRIPTION_MAX).optional(),
      context: z.enum(CONTEXTS).optional(),
      status: z.enum(PROJECT_STATUSES).optional(),
      repo: z.string().optional(),
    },
    { idempotentHint: true },
    async (params) => {
      try {
        const { id, ...fields } = params;
        const result = await project.update(id, fields);
        if (!result) {
          return serviceError({ code: "NOT_FOUND", message: `Project '${id}' not found` });
        }
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── archive_project ──────────────────────────────────────────
  server.tool(
    "archive_project",
    "Archive a project. Edges are preserved. This does not delete the project.",
    {
      id: z.string().describe("Project ID (ULID)"),
    },
    async (params) => {
      try {
        const result = await project.archive(params.id);
        if (!result) {
          return serviceError({ code: "NOT_FOUND", message: `Project '${params.id}' not found` });
        }
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );
}
