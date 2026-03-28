import type { Edge, EntityType, IntegrityReport } from "../types";
import { EDGE_VALIDATION_MATRIX } from "../types";

export class IntegrityService {
  constructor(private db: D1Database) {}

  async validate(): Promise<IntegrityReport> {
    // Fetch all edges from DB
    const result = await this.db.prepare("SELECT * FROM edges").all<Edge>();
    const edges = result.results;

    const orphaned: Edge[] = [];
    const invalid: Edge[] = [];

    for (const edge of edges) {
      // 1. Matrix validation: is relation allowed for from_type -> to_type?
      const matrixKey = `${edge.from_type}->${edge.to_type}`;
      const isMatrixValid = EDGE_VALIDATION_MATRIX[edge.relation]?.[matrixKey] === true;

      if (!isMatrixValid) {
        invalid.push(edge);
        continue;
      }

      // 2. Entity existence checks
      const [fromExists, toExists] = await Promise.all([
        this.entityExists(edge.from_type, edge.from_id),
        this.entityExists(edge.to_type, edge.to_id),
      ]);

      if (!fromExists || !toExists) {
        orphaned.push(edge);
        continue;
      }
    }

    const valid = edges.length - orphaned.length - invalid.length;

    return { valid, orphaned, invalid };
  }

  private async entityExists(type: EntityType, id: string): Promise<boolean> {
    const table = type === "node" ? "nodes" : type === "project" ? "projects" : "tasks";
    const result = await this.db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).bind(id).first();
    return result !== null;
  }
}
