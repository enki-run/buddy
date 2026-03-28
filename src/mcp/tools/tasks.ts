import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TaskService } from "../../services/task";
import { CONTEXTS, TASK_STATUSES, PRIORITIES, RECURRING_INTERVALS, LIMITS } from "../../types";

interface TaskToolDeps {
  task: TaskService;
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

const taskItemSchema = z.object({
  title: z.string().max(LIMITS.TITLE_MAX),
  project_id: z.string().optional(),
  description: z.string().max(LIMITS.DESCRIPTION_MAX).optional(),
  priority: z.enum(PRIORITIES).optional(),
  due_date: z.string().optional().describe("ISO date (YYYY-MM-DD)"),
  tags: z.array(z.string().max(LIMITS.TAG_MAX_LENGTH)).max(LIMITS.TAGS_MAX_COUNT).optional(),
  recurring: z.enum(RECURRING_INTERVALS).optional(),
  context: z.enum(CONTEXTS).optional(),
});

export function registerTaskTools(server: McpServer, deps: TaskToolDeps) {
  const { task } = deps;

  // ── create_task ──────────────────────────────────────────────
  server.tool(
    "create_task",
    "Create a new task. For recurring jobs (e.g., 'Check SSL certificates') use recurring + context without project_id. For strategic project tasks use project_id without recurring.",
    {
      title: z.string().max(LIMITS.TITLE_MAX).describe("Task title"),
      project_id: z.string().optional().describe("Project ID to attach to"),
      description: z.string().max(LIMITS.DESCRIPTION_MAX).optional(),
      priority: z.enum(PRIORITIES).optional().describe("Priority level (default: medium)"),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      tags: z.array(z.string().max(LIMITS.TAG_MAX_LENGTH)).max(LIMITS.TAGS_MAX_COUNT).optional(),
      recurring: z.enum(RECURRING_INTERVALS).optional().describe("Recurring interval"),
      context: z.enum(CONTEXTS).optional(),
    },
    async (params) => {
      try {
        const result = await task.create(params);
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── list_tasks ───────────────────────────────────────────────
  server.tool(
    "list_tasks",
    "List tasks with optional filters. Sorted by priority then due date.",
    {
      project_id: z.string().optional(),
      status: z.enum(TASK_STATUSES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      context: z.enum(CONTEXTS).optional(),
      tag: z.string().optional().describe("Filter by single tag"),
      limit: z.number().min(1).max(LIMITS.PAGINATION_MAX).default(LIMITS.PAGINATION_DEFAULT).optional(),
      offset: z.number().min(0).default(0).optional(),
    },
    { readOnlyHint: true },
    async (params) => {
      try {
        const result = await task.list({
          project_id: params.project_id,
          status: params.status,
          priority: params.priority,
          context: params.context,
          tag: params.tag,
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

  // ── update_task ──────────────────────────────────────────────
  server.tool(
    "update_task",
    "Update an existing task's fields. Only provided fields are changed.",
    {
      id: z.string().describe("Task ID (ULID)"),
      title: z.string().max(LIMITS.TITLE_MAX).optional(),
      description: z.string().max(LIMITS.DESCRIPTION_MAX).optional(),
      status: z.enum(TASK_STATUSES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      tags: z.array(z.string().max(LIMITS.TAG_MAX_LENGTH)).max(LIMITS.TAGS_MAX_COUNT).optional(),
      project_id: z.string().optional(),
      recurring: z.enum(RECURRING_INTERVALS).optional(),
      context: z.enum(CONTEXTS).optional(),
    },
    { idempotentHint: true },
    async (params) => {
      try {
        const { id, ...fields } = params;
        const result = await task.update(id, fields);
        if (!result) {
          return serviceError({ code: "NOT_FOUND", message: `Task '${id}' not found` });
        }
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── complete_task ────────────────────────────────────────────
  server.tool(
    "complete_task",
    "Mark a task as done. Optionally link a result node via produced_by edge.",
    {
      id: z.string().describe("Task ID (ULID)"),
      result_node_id: z.string().optional().describe("ID of a node produced by this task"),
    },
    { idempotentHint: true },
    async (params) => {
      try {
        const result = await task.complete(params.id, params.result_node_id);
        if (!result) {
          return serviceError({ code: "NOT_FOUND", message: `Task '${params.id}' not found` });
        }
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── move_task ────────────────────────────────────────────────
  server.tool(
    "move_task",
    "Move a task to a different project.",
    {
      id: z.string().describe("Task ID (ULID)"),
      project_id: z.string().describe("Target project ID"),
    },
    { idempotentHint: true },
    async (params) => {
      try {
        const result = await task.move(params.id, params.project_id);
        if (!result) {
          return serviceError({ code: "NOT_FOUND", message: `Task '${params.id}' not found` });
        }
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── bulk_create_tasks ────────────────────────────────────────
  server.tool(
    "bulk_create_tasks",
    `Create up to ${LIMITS.BULK_TASKS_MAX} tasks in a single atomic batch. All or nothing.`,
    {
      tasks: z.array(taskItemSchema).min(1).max(LIMITS.BULK_TASKS_MAX).describe("Array of task definitions"),
    },
    async (params) => {
      try {
        const result = await task.bulkCreate(params.tasks);
        return ok({ created: result.length, tasks: result });
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );

  // ── complete_recurring_task ──────────────────────────────────
  server.tool(
    "complete_recurring_task",
    "Complete a recurring task and automatically create the next occurrence with the calculated due date.",
    {
      id: z.string().describe("Recurring task ID (ULID)"),
    },
    async (params) => {
      try {
        const result = await task.completeRecurring(params.id);
        if (!result) {
          return serviceError({ code: "NOT_FOUND", message: `Task '${params.id}' not found` });
        }
        return ok(result);
      } catch (err: any) {
        if (err.code) return serviceError(err);
        throw err;
      }
    },
  );
}
