import { ulid } from "ulidx";
import type { Task, Context, Priority, TaskStatus, RecurringInterval, PaginatedResult } from "../types";
import { LIMITS } from "../types";
import type { ActivityService } from "./activity";
import type { EdgeService } from "./edge";

export class TaskService {
  constructor(
    private db: D1Database,
    private activity: ActivityService,
    private edge: EdgeService,
  ) {}

  async create(params: {
    title: string;
    project_id?: string;
    description?: string;
    priority?: Priority;
    due_date?: string;
    tags?: string[];
    recurring?: RecurringInterval;
    context?: Context;
  }): Promise<Task> {
    // Validate
    if (params.title.length > LIMITS.TITLE_MAX) {
      throw Object.assign(
        new Error(`Title exceeds maximum length of ${LIMITS.TITLE_MAX} characters`),
        { code: "VALIDATION_ERROR" },
      );
    }
    if (params.description !== undefined && params.description.length > LIMITS.DESCRIPTION_MAX) {
      throw Object.assign(
        new Error(`Description exceeds maximum length of ${LIMITS.DESCRIPTION_MAX} characters`),
        { code: "VALIDATION_ERROR" },
      );
    }
    if (params.tags !== undefined && params.tags.length > LIMITS.TAGS_MAX_COUNT) {
      throw Object.assign(
        new Error(`Tags exceed maximum count of ${LIMITS.TAGS_MAX_COUNT}`),
        { code: "VALIDATION_ERROR" },
      );
    }

    // Resolve project context if no context specified
    let resolvedContext = params.context ?? null;
    let resolvedProjectId = params.project_id ?? null;

    if (resolvedProjectId !== null) {
      const project = await this.db
        .prepare("SELECT id, context FROM projects WHERE id = ?")
        .bind(resolvedProjectId)
        .first<{ id: string; context: Context | null }>();

      if (!project) {
        throw Object.assign(
          new Error(`Project with id '${resolvedProjectId}' not found`),
          { code: "NOT_FOUND" },
        );
      }

      // Use project context if task context not specified
      if (resolvedContext === null && project.context !== null) {
        resolvedContext = project.context;
      }
    }

    const id = ulid();
    const now = new Date().toISOString();
    const status: TaskStatus = "backlog";
    const priority: Priority = params.priority ?? "medium";
    const tags = params.tags !== undefined ? JSON.stringify(params.tags) : null;

    await this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, description, status, priority, due_date, tags, is_milestone, recurring, context, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        id,
        resolvedProjectId,
        params.title,
        params.description ?? null,
        status,
        priority,
        params.due_date ?? null,
        tags,
        params.recurring ?? null,
        resolvedContext,
        now,
        now,
      )
      .run();

    await this.activity.log({
      action: "task_created",
      entity_type: "task",
      entity_id: id,
      project_id: resolvedProjectId ?? undefined,
      summary: `Created task: ${params.title}`,
    });

    return {
      id,
      project_id: resolvedProjectId,
      title: params.title,
      description: params.description ?? null,
      status,
      priority,
      due_date: params.due_date ?? null,
      tags,
      is_milestone: 0,
      recurring: params.recurring ?? null,
      context: resolvedContext,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
  }

  async list(params: {
    project_id?: string;
    status?: TaskStatus;
    priority?: Priority;
    context?: Context;
    tag?: string;
    limit: number;
    offset: number;
  }): Promise<PaginatedResult<Task>> {
    const { limit, offset } = params;
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.project_id !== undefined) {
      conditions.push("t.project_id = ?");
      bindings.push(params.project_id);
    }
    if (params.status !== undefined) {
      conditions.push("t.status = ?");
      bindings.push(params.status);
    }
    if (params.priority !== undefined) {
      conditions.push("t.priority = ?");
      bindings.push(params.priority);
    }
    if (params.context !== undefined) {
      conditions.push("t.context = ?");
      bindings.push(params.context);
    }
    if (params.tag !== undefined) {
      // Filter by tag using json_each on the tags JSON array
      conditions.push(
        "EXISTS (SELECT 1 FROM json_each(t.tags) WHERE json_each.value = ?)",
      );
      bindings.push(params.tag);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Priority weight: critical=0, high=1, medium=2, low=3
    const orderClause = `ORDER BY
      CASE t.priority
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
      END ASC,
      t.due_date ASC NULLS LAST,
      t.created_at DESC`;

    const [dataResult, countResult] = await Promise.all([
      this.db
        .prepare(`SELECT t.* FROM tasks t ${whereClause} ${orderClause} LIMIT ? OFFSET ?`)
        .bind(...bindings, limit, offset)
        .all<Task>(),
      this.db
        .prepare(`SELECT COUNT(*) as total FROM tasks t ${whereClause}`)
        .bind(...bindings)
        .first<{ total: number }>(),
    ]);

    const total = countResult?.total ?? 0;
    const data = dataResult.results;

    return {
      data,
      has_more: offset + data.length < total,
      total,
      limit,
      offset,
    };
  }

  async update(
    id: string,
    params: Partial<{
      title: string;
      description: string;
      status: TaskStatus;
      priority: Priority;
      due_date: string;
      tags: string[];
      project_id: string;
      recurring: RecurringInterval;
      context: Context;
    }>,
  ): Promise<Task | null> {
    const existing = await this.db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .bind(id)
      .first<Task>();

    if (!existing) return null;

    // Validate
    if (params.title !== undefined && params.title.length > LIMITS.TITLE_MAX) {
      throw Object.assign(
        new Error(`Title exceeds maximum length of ${LIMITS.TITLE_MAX} characters`),
        { code: "VALIDATION_ERROR" },
      );
    }
    if (params.description !== undefined && params.description.length > LIMITS.DESCRIPTION_MAX) {
      throw Object.assign(
        new Error(`Description exceeds maximum length of ${LIMITS.DESCRIPTION_MAX} characters`),
        { code: "VALIDATION_ERROR" },
      );
    }
    if (params.tags !== undefined && params.tags.length > LIMITS.TAGS_MAX_COUNT) {
      throw Object.assign(
        new Error(`Tags exceed maximum count of ${LIMITS.TAGS_MAX_COUNT}`),
        { code: "VALIDATION_ERROR" },
      );
    }

    const now = new Date().toISOString();
    const setClauses: string[] = ["updated_at = ?"];
    const bindings: unknown[] = [now];

    if (params.title !== undefined) {
      setClauses.push("title = ?");
      bindings.push(params.title);
    }
    if (params.description !== undefined) {
      setClauses.push("description = ?");
      bindings.push(params.description);
    }
    if (params.status !== undefined) {
      setClauses.push("status = ?");
      bindings.push(params.status);
    }
    if (params.priority !== undefined) {
      setClauses.push("priority = ?");
      bindings.push(params.priority);
    }
    if (params.due_date !== undefined) {
      setClauses.push("due_date = ?");
      bindings.push(params.due_date);
    }
    if (params.tags !== undefined) {
      setClauses.push("tags = ?");
      bindings.push(JSON.stringify(params.tags));
    }
    if (params.project_id !== undefined) {
      setClauses.push("project_id = ?");
      bindings.push(params.project_id);
    }
    if (params.recurring !== undefined) {
      setClauses.push("recurring = ?");
      bindings.push(params.recurring);
    }
    if (params.context !== undefined) {
      setClauses.push("context = ?");
      bindings.push(params.context);
    }

    bindings.push(id);

    await this.db
      .prepare(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`)
      .bind(...bindings)
      .run();

    await this.activity.log({
      action: "task_updated",
      entity_type: "task",
      entity_id: id,
      project_id: existing.project_id ?? undefined,
      summary: `Updated task: ${params.title ?? existing.title}`,
    });

    return this.db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Task>();
  }

  async complete(id: string, result_node_id?: string): Promise<Task | null> {
    const existing = await this.db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .bind(id)
      .first<Task>();

    if (!existing) return null;

    const now = new Date().toISOString();

    await this.db
      .prepare(
        `UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, id)
      .run();

    // If result_node_id provided, try to create edge (silently skip if node doesn't exist)
    if (result_node_id !== undefined) {
      const nodeExists = await this.db
        .prepare("SELECT 1 FROM nodes WHERE id = ?")
        .bind(result_node_id)
        .first();

      if (nodeExists) {
        try {
          await this.edge.link({
            from_type: "task",
            from_id: id,
            to_type: "node",
            to_id: result_node_id,
            relation: "produced_by",
          });
        } catch {
          // Silently ignore edge creation errors (e.g. duplicate)
        }
      }
      // If node doesn't exist: task is still completed, no edge created
    }

    await this.activity.log({
      action: "task_completed",
      entity_type: "task",
      entity_id: id,
      project_id: existing.project_id ?? undefined,
      summary: `Completed task: ${existing.title}`,
    });

    return this.db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Task>();
  }

  async completeRecurring(id: string): Promise<{ completed: Task; next: Task } | null> {
    const existing = await this.db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .bind(id)
      .first<Task>();

    if (!existing) return null;

    if (!existing.recurring) {
      throw Object.assign(
        new Error(`Task '${id}' is not a recurring task`),
        { code: "VALIDATION_ERROR" },
      );
    }

    const now = new Date().toISOString();

    // Complete the current task
    await this.db
      .prepare(
        `UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, id)
      .run();

    await this.activity.log({
      action: "task_completed",
      entity_type: "task",
      entity_id: id,
      project_id: existing.project_id ?? undefined,
      summary: `Completed recurring task: ${existing.title}`,
    });

    // Calculate next due_date using UTC to avoid timezone shifts
    let nextDueDate: string;
    if (existing.due_date) {
      // Parse YYYY-MM-DD parts directly to avoid timezone issues
      const [year, month, day] = existing.due_date.split("-").map(Number);
      const nextDate = new Date(Date.UTC(year, month - 1, day));

      switch (existing.recurring) {
        case "weekly":
          nextDate.setUTCDate(nextDate.getUTCDate() + 7);
          break;
        case "monthly":
          nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
          break;
        case "quarterly":
          nextDate.setUTCMonth(nextDate.getUTCMonth() + 3);
          break;
        case "yearly":
          nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
          break;
      }

      nextDueDate = nextDate.toISOString().split("T")[0];
    } else {
      // No due_date: use today as base
      const today = new Date();
      const nextDate = new Date(Date.UTC(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ));

      switch (existing.recurring) {
        case "weekly":
          nextDate.setUTCDate(nextDate.getUTCDate() + 7);
          break;
        case "monthly":
          nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
          break;
        case "quarterly":
          nextDate.setUTCMonth(nextDate.getUTCMonth() + 3);
          break;
        case "yearly":
          nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
          break;
      }

      nextDueDate = nextDate.toISOString().split("T")[0];
    }

    // Reconstruct existing tags as string[]
    let existingTags: string[] | undefined;
    if (existing.tags) {
      try {
        existingTags = JSON.parse(existing.tags) as string[];
      } catch {
        existingTags = undefined;
      }
    }

    // Create the next recurring task
    const next = await this.create({
      title: existing.title,
      project_id: existing.project_id ?? undefined,
      description: existing.description ?? undefined,
      priority: existing.priority,
      due_date: nextDueDate,
      tags: existingTags,
      recurring: existing.recurring,
      context: existing.context ?? undefined,
    });

    // Re-fetch the completed task to get updated fields
    const completed = await this.db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .bind(id)
      .first<Task>() as Task;

    return { completed, next };
  }

  async move(id: string, project_id: string): Promise<Task | null> {
    const existing = await this.db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .bind(id)
      .first<Task>();

    if (!existing) return null;

    // Verify target project exists
    const project = await this.db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .bind(project_id)
      .first<{ id: string }>();

    if (!project) {
      throw Object.assign(
        new Error(`Project with id '${project_id}' not found`),
        { code: "NOT_FOUND" },
      );
    }

    const now = new Date().toISOString();

    await this.db
      .prepare(`UPDATE tasks SET project_id = ?, updated_at = ? WHERE id = ?`)
      .bind(project_id, now, id)
      .run();

    await this.activity.log({
      action: "task_moved",
      entity_type: "task",
      entity_id: id,
      project_id: project_id,
      summary: `Moved task '${existing.title}' to project '${project_id}'`,
    });

    return this.db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Task>();
  }

  async bulkCreate(
    tasks: Array<{
      title: string;
      project_id?: string;
      description?: string;
      priority?: Priority;
      due_date?: string;
      tags?: string[];
      recurring?: RecurringInterval;
      context?: Context;
    }>,
  ): Promise<Task[]> {
    if (tasks.length > LIMITS.BULK_TASKS_MAX) {
      throw Object.assign(
        new Error(`Bulk create exceeds maximum of ${LIMITS.BULK_TASKS_MAX} tasks`),
        { code: "VALIDATION_ERROR" },
      );
    }

    if (tasks.length === 0) return [];

    const now = new Date().toISOString();
    const created: Task[] = [];

    // Validate all tasks first and prepare inserts
    const inserts: ReturnType<D1Database["prepare"]>[] = [];
    const activityInserts: ReturnType<D1Database["prepare"]>[] = [];

    for (const taskParams of tasks) {
      if (taskParams.title.length > LIMITS.TITLE_MAX) {
        throw Object.assign(
          new Error(`Title exceeds maximum length of ${LIMITS.TITLE_MAX} characters`),
          { code: "VALIDATION_ERROR" },
        );
      }
      if (taskParams.description !== undefined && taskParams.description.length > LIMITS.DESCRIPTION_MAX) {
        throw Object.assign(
          new Error(`Description exceeds maximum length of ${LIMITS.DESCRIPTION_MAX} characters`),
          { code: "VALIDATION_ERROR" },
        );
      }
      if (taskParams.tags !== undefined && taskParams.tags.length > LIMITS.TAGS_MAX_COUNT) {
        throw Object.assign(
          new Error(`Tags exceed maximum count of ${LIMITS.TAGS_MAX_COUNT}`),
          { code: "VALIDATION_ERROR" },
        );
      }

      const id = ulid();
      const status: TaskStatus = "backlog";
      const priority: Priority = taskParams.priority ?? "medium";
      const tags = taskParams.tags !== undefined ? JSON.stringify(taskParams.tags) : null;
      const project_id = taskParams.project_id ?? null;
      const context = taskParams.context ?? null;

      inserts.push(
        this.db
          .prepare(
            `INSERT INTO tasks (id, project_id, title, description, status, priority, due_date, tags, is_milestone, recurring, context, created_at, updated_at, completed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL)`,
          )
          .bind(
            id,
            project_id,
            taskParams.title,
            taskParams.description ?? null,
            status,
            priority,
            taskParams.due_date ?? null,
            tags,
            taskParams.recurring ?? null,
            context,
            now,
            now,
          ),
      );

      const activityId = ulid();
      activityInserts.push(
        this.db
          .prepare(
            `INSERT INTO activity_log (id, project_id, action, entity_type, entity_id, summary, ip_hash, created_at)
             VALUES (?, ?, 'task_created', 'task', ?, ?, NULL, ?)`,
          )
          .bind(
            activityId,
            project_id,
            id,
            `Created task: ${taskParams.title}`,
            now,
          ),
      );

      created.push({
        id,
        project_id,
        title: taskParams.title,
        description: taskParams.description ?? null,
        status,
        priority,
        due_date: taskParams.due_date ?? null,
        tags,
        is_milestone: 0,
        recurring: taskParams.recurring ?? null,
        context,
        created_at: now,
        updated_at: now,
        completed_at: null,
      });
    }

    // Execute all inserts atomically
    await this.db.batch([...inserts, ...activityInserts]);

    return created;
  }
}
