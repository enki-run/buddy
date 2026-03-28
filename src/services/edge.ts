import { ulid } from "ulidx";
import type { Edge, EntityType, Relation, Node, Project, Task, PaginatedResult } from "../types";
import { EDGE_VALIDATION_MATRIX, LIMITS } from "../types";
import type { ActivityService } from "./activity";

export class EdgeService {
  constructor(
    private db: D1Database,
    private activity: ActivityService,
  ) {}

  async link(params: {
    from_type: EntityType;
    from_id: string;
    to_type: EntityType;
    to_id: string;
    relation: Relation;
    note?: string;
  }): Promise<Edge> {
    const { from_type, from_id, to_type, to_id, relation } = params;

    // 1. Validate relation against EDGE_VALIDATION_MATRIX
    const key = `${from_type}->${to_type}`;
    if (!EDGE_VALIDATION_MATRIX[relation]?.[key]) {
      // Collect all allowed relations for this from_type->to_type combo
      const allowedRelations = (Object.keys(EDGE_VALIDATION_MATRIX) as Relation[]).filter(
        (rel) => EDGE_VALIDATION_MATRIX[rel]?.[key],
      );
      throw Object.assign(
        new Error(
          `Relation '${relation}' is not allowed between ${from_type} and ${to_type}. Allowed: ${allowedRelations.join(", ") || "none"}`,
        ),
        { code: "VALIDATION_ERROR" },
      );
    }

    // 2. Validate note length
    if (params.note !== undefined && params.note.length > LIMITS.NOTE_MAX) {
      throw Object.assign(
        new Error(`Note exceeds maximum length of ${LIMITS.NOTE_MAX} characters`),
        { code: "VALIDATION_ERROR" },
      );
    }

    // 3. Validate entity existence
    const fromExists = await this.entityExists(from_type, from_id);
    if (!fromExists) {
      throw Object.assign(
        new Error(`${from_type} with id '${from_id}' not found`),
        { code: "NOT_FOUND" },
      );
    }

    const toExists = await this.entityExists(to_type, to_id);
    if (!toExists) {
      throw Object.assign(
        new Error(`${to_type} with id '${to_id}' not found`),
        { code: "NOT_FOUND" },
      );
    }

    // 4. Insert edge
    const id = ulid();
    const created_at = new Date().toISOString();
    const note = params.note ?? null;

    try {
      await this.db
        .prepare(
          `INSERT INTO edges (id, from_type, from_id, to_type, to_id, relation, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, from_type, from_id, to_type, to_id, relation, note, created_at)
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE constraint failed")) {
        throw Object.assign(
          new Error(`Edge already exists between ${from_type}:${from_id} and ${to_type}:${to_id} with relation '${relation}'`),
          { code: "CONFLICT" },
        );
      }
      throw err;
    }

    // 5. Log activity with readable names
    const [fromName, toName] = await Promise.all([
      this.getEntityName(from_type, from_id),
      this.getEntityName(to_type, to_id),
    ]);
    const relLabel = relation.replace(/_/g, " ");
    await this.activity.log({
      action: "edge_created",
      entity_type: "edge",
      entity_id: id,
      summary: `${fromName ?? from_id} —[${relLabel}]→ ${toName ?? to_id}`,
    });

    return { id, from_type, from_id, to_type, to_id, relation, note, created_at };
  }

  async getRelated(params: {
    entity_type: EntityType;
    entity_id: string;
    relation?: Relation;
    direction?: "incoming" | "outgoing" | "both";
    limit: number;
    offset: number;
  }): Promise<PaginatedResult<{ entity: Node | Project | Task; edge: Edge }>> {
    const { entity_type, entity_id, relation, limit, offset } = params;
    const direction = params.direction ?? "both";

    // Build WHERE conditions
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (direction === "outgoing") {
      conditions.push("(e.from_type = ? AND e.from_id = ?)");
      bindings.push(entity_type, entity_id);
    } else if (direction === "incoming") {
      conditions.push("(e.to_type = ? AND e.to_id = ?)");
      bindings.push(entity_type, entity_id);
    } else {
      // both
      conditions.push("((e.from_type = ? AND e.from_id = ?) OR (e.to_type = ? AND e.to_id = ?))");
      bindings.push(entity_type, entity_id, entity_type, entity_id);
    }

    if (relation !== undefined) {
      conditions.push("e.relation = ?");
      bindings.push(relation);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Get total count
    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as total FROM edges e ${whereClause}`)
      .bind(...bindings)
      .first<{ total: number }>();
    const total = countResult?.total ?? 0;

    // Get paginated edges
    const edgesResult = await this.db
      .prepare(`SELECT * FROM edges e ${whereClause} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset)
      .all<Edge>();

    const edges = edgesResult.results;

    if (edges.length === 0) {
      return { data: [], has_more: false, total, limit, offset };
    }

    // Batch-fetch related entities grouped by type
    // For each edge, determine the "other" entity (not the queried one)
    const nodeIds: string[] = [];
    const projectIds: string[] = [];
    const taskIds: string[] = [];

    for (const edge of edges) {
      // Determine the target entity for this edge (relative to the queried entity)
      const targetType = this.getTargetType(edge, entity_type, entity_id, direction);
      const targetId = this.getTargetId(edge, entity_type, entity_id, direction);

      if (targetType === "node") nodeIds.push(targetId);
      else if (targetType === "project") projectIds.push(targetId);
      else if (targetType === "task") taskIds.push(targetId);
    }

    // Fetch entities in batch
    const [nodes, projects, tasks] = await Promise.all([
      nodeIds.length > 0 ? this.fetchNodesByIds(nodeIds) : Promise.resolve([]),
      projectIds.length > 0 ? this.fetchProjectsByIds(projectIds) : Promise.resolve([]),
      taskIds.length > 0 ? this.fetchTasksByIds(taskIds) : Promise.resolve([]),
    ]);

    // Build lookup maps
    const nodeMap = new Map<string, Node>(nodes.map((n) => [n.id, n]));
    const projectMap = new Map<string, Project>(projects.map((p) => [p.id, p]));
    const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));

    // Assemble results
    const data: { entity: Node | Project | Task; edge: Edge }[] = [];

    for (const edge of edges) {
      const targetType = this.getTargetType(edge, entity_type, entity_id, direction);
      const targetId = this.getTargetId(edge, entity_type, entity_id, direction);

      let entity: Node | Project | Task | undefined;
      if (targetType === "node") entity = nodeMap.get(targetId);
      else if (targetType === "project") entity = projectMap.get(targetId);
      else if (targetType === "task") entity = taskMap.get(targetId);

      if (entity) {
        data.push({ entity, edge });
      }
    }

    return {
      data,
      has_more: offset + data.length < total,
      total,
      limit,
      offset,
    };
  }

  async deleteEdge(id: string): Promise<boolean> {
    const existing = await this.db
      .prepare("SELECT * FROM edges WHERE id = ?")
      .bind(id)
      .first<Edge>();

    if (!existing) return false;

    await this.db.prepare("DELETE FROM edges WHERE id = ?").bind(id).run();

    const [delFromName, delToName] = await Promise.all([
      this.getEntityName(existing.from_type as EntityType, existing.from_id),
      this.getEntityName(existing.to_type as EntityType, existing.to_id),
    ]);
    await this.activity.log({
      action: "edge_deleted",
      entity_type: "edge",
      entity_id: id,
      summary: `${delFromName ?? existing.from_id} —[${existing.relation.replace(/_/g, " ")}]→ ${delToName ?? existing.to_id}`,
    });

    return true;
  }

  async cleanupForEntity(entity_type: EntityType, entity_id: string): Promise<number> {
    const result = await this.db
      .prepare(
        `DELETE FROM edges WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?)`,
      )
      .bind(entity_type, entity_id, entity_type, entity_id)
      .run();

    return result.meta.changes ?? 0;
  }

  // === Private Helpers ===

  private async entityExists(entity_type: EntityType, entity_id: string): Promise<boolean> {
    const name = await this.getEntityName(entity_type, entity_id);
    return name !== null;
  }

  private async getEntityName(entity_type: EntityType, entity_id: string): Promise<string | null> {
    const table = this.tableForType(entity_type);
    const nameCol = entity_type === "project" ? "name" : "title";
    const row = await this.db
      .prepare(`SELECT ${nameCol} as label FROM ${table} WHERE id = ?`)
      .bind(entity_id)
      .first<{ label: string }>();
    return row?.label ?? null;
  }

  private tableForType(entity_type: EntityType): string {
    if (entity_type === "node") return "nodes";
    if (entity_type === "project") return "projects";
    return "tasks";
  }

  private getTargetType(
    edge: Edge,
    entity_type: EntityType,
    entity_id: string,
    direction: "incoming" | "outgoing" | "both",
  ): EntityType {
    if (direction === "outgoing") return edge.to_type;
    if (direction === "incoming") return edge.from_type;
    // For "both": return the other side
    if (edge.from_type === entity_type && edge.from_id === entity_id) return edge.to_type;
    return edge.from_type;
  }

  private getTargetId(
    edge: Edge,
    entity_type: EntityType,
    entity_id: string,
    direction: "incoming" | "outgoing" | "both",
  ): string {
    if (direction === "outgoing") return edge.to_id;
    if (direction === "incoming") return edge.from_id;
    // For "both": return the other side's id
    if (edge.from_type === entity_type && edge.from_id === entity_id) return edge.to_id;
    return edge.from_id;
  }

  private async fetchNodesByIds(ids: string[]): Promise<Node[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const result = await this.db
      .prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<Node>();
    return result.results;
  }

  private async fetchProjectsByIds(ids: string[]): Promise<Project[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const result = await this.db
      .prepare(`SELECT * FROM projects WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<Project>();
    return result.results;
  }

  private async fetchTasksByIds(ids: string[]): Promise<Task[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const result = await this.db
      .prepare(`SELECT * FROM tasks WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<Task>();
    return result.results;
  }
}
