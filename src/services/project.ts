import { ulid } from "ulidx";
import type { Project, Context, ProjectStatus, PaginatedResult, Edge } from "../types";
import { LIMITS } from "../types";
import type { ActivityService } from "./activity";
import type { EdgeService } from "./edge";

export class ProjectService {
  constructor(
    private db: D1Database,
    private activity: ActivityService,
    private edge: EdgeService,
  ) {}

  async create(params: {
    name: string;
    context?: Context;
    description?: string;
    template?: string;
    repo?: string;
  }): Promise<Project> {
    // Validate
    if (params.name.length > LIMITS.TITLE_MAX) {
      throw new Error(`Name exceeds maximum length of ${LIMITS.TITLE_MAX} characters`);
    }
    if (params.description !== undefined && params.description.length > LIMITS.DESCRIPTION_MAX) {
      throw new Error(`Description exceeds maximum length of ${LIMITS.DESCRIPTION_MAX} characters`);
    }

    const id = ulid();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO projects (id, name, description, context, status, template, repo, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'planning', ?, ?, ?, ?)`,
      )
      .bind(
        id,
        params.name,
        params.description ?? null,
        params.context ?? null,
        params.template ?? null,
        params.repo ?? null,
        now,
        now,
      )
      .run();

    await this.activity.log({
      action: "project_created",
      entity_type: "project",
      entity_id: id,
      project_id: id,
      summary: `Created project: ${params.name}`,
    });

    return {
      id,
      name: params.name,
      description: params.description ?? null,
      context: params.context ?? null,
      status: "planning",
      template: params.template ?? null,
      repo: params.repo ?? null,
      created_at: now,
      updated_at: now,
    };
  }

  async getById(
    id: string,
  ): Promise<{ project: Project; related_nodes: Array<{ node: any; edge: Edge }> } | null> {
    const project = await this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .bind(id)
      .first<Project>();

    if (!project) return null;

    // Fetch related entities via EdgeService (both directions, all relations)
    const related = await this.edge.getRelated({
      entity_type: "project",
      entity_id: id,
      direction: "both",
      limit: 200,
      offset: 0,
    });

    // Filter to only node entities
    const related_nodes = related.data
      .filter((item) => {
        const edge = item.edge;
        // Determine which side is the "other" entity
        if (edge.from_type === "project" && edge.from_id === id) {
          return edge.to_type === "node";
        } else {
          return edge.from_type === "node";
        }
      })
      .map((item) => ({ node: item.entity, edge: item.edge }));

    return { project, related_nodes };
  }

  async list(params: {
    context?: Context;
    status?: ProjectStatus;
    limit: number;
    offset: number;
  }): Promise<PaginatedResult<Project>> {
    const { limit, offset } = params;
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.context !== undefined) {
      conditions.push("p.context = ?");
      bindings.push(params.context);
    }
    if (params.status !== undefined) {
      conditions.push("p.status = ?");
      bindings.push(params.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [dataResult, countResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT p.* FROM projects p ${whereClause} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
        )
        .bind(...bindings, limit, offset)
        .all<Project>(),
      this.db
        .prepare(`SELECT COUNT(*) as total FROM projects p ${whereClause}`)
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
      name: string;
      description: string;
      context: Context;
      status: ProjectStatus;
      repo: string;
    }>,
  ): Promise<Project | null> {
    const existing = await this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .bind(id)
      .first<Project>();

    if (!existing) return null;

    // Validate
    if (params.name !== undefined && params.name.length > LIMITS.TITLE_MAX) {
      throw new Error(`Name exceeds maximum length of ${LIMITS.TITLE_MAX} characters`);
    }
    if (params.description !== undefined && params.description.length > LIMITS.DESCRIPTION_MAX) {
      throw new Error(`Description exceeds maximum length of ${LIMITS.DESCRIPTION_MAX} characters`);
    }

    const now = new Date().toISOString();
    const setClauses: string[] = ["updated_at = ?"];
    const bindings: unknown[] = [now];

    if (params.name !== undefined) {
      setClauses.push("name = ?");
      bindings.push(params.name);
    }
    if (params.description !== undefined) {
      setClauses.push("description = ?");
      bindings.push(params.description);
    }
    if (params.context !== undefined) {
      setClauses.push("context = ?");
      bindings.push(params.context);
    }
    if (params.status !== undefined) {
      setClauses.push("status = ?");
      bindings.push(params.status);
    }
    if (params.repo !== undefined) {
      setClauses.push("repo = ?");
      bindings.push(params.repo);
    }

    bindings.push(id);

    await this.db
      .prepare(`UPDATE projects SET ${setClauses.join(", ")} WHERE id = ?`)
      .bind(...bindings)
      .run();

    await this.activity.log({
      action: "project_updated",
      entity_type: "project",
      entity_id: id,
      project_id: id,
      summary: `Updated project: ${params.name ?? existing.name}`,
    });

    return this.db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<Project>();
  }

  async archive(id: string): Promise<Project | null> {
    const existing = await this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .bind(id)
      .first<Project>();

    if (!existing) return null;

    const now = new Date().toISOString();

    await this.db
      .prepare(`UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?`)
      .bind(now, id)
      .run();

    await this.activity.log({
      action: "project_archived",
      entity_type: "project",
      entity_id: id,
      project_id: id,
      summary: `Archived project: ${existing.name}`,
    });

    // Edges are PRESERVED — archive != delete

    return this.db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<Project>();
  }
}
