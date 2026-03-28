import { ulid } from "ulidx";
import type { Activity, PaginatedResult } from "../types";

export class ActivityService {
  constructor(private db: D1Database) {}

  async log(params: {
    action: string;
    entity_type: string;
    entity_id: string;
    summary?: string;
    project_id?: string;
    ip_hash?: string;
  }): Promise<Activity> {
    const id = ulid();
    const created_at = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO activity_log (id, project_id, action, entity_type, entity_id, summary, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        params.project_id ?? null,
        params.action,
        params.entity_type,
        params.entity_id,
        params.summary ?? null,
        params.ip_hash ?? null,
        created_at
      )
      .run();

    return {
      id,
      project_id: params.project_id ?? null,
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      summary: params.summary ?? null,
      ip_hash: params.ip_hash ?? null,
      created_at,
    };
  }

  async list(params: {
    project_id?: string;
    limit: number;
    offset: number;
  }): Promise<PaginatedResult<Activity>> {
    const { project_id, limit, offset } = params;

    let dataQuery: string;
    let countQuery: string;
    let bindings: unknown[];

    if (project_id !== undefined) {
      dataQuery = `SELECT * FROM activity_log WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total FROM activity_log WHERE project_id = ?`;
      bindings = [project_id];
    } else {
      dataQuery = `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total FROM activity_log`;
      bindings = [];
    }

    const [dataResult, countResult] = await Promise.all([
      this.db
        .prepare(dataQuery)
        .bind(...bindings, limit, offset)
        .all<Activity>(),
      this.db
        .prepare(countQuery)
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

  async rotate(retentionDays: number): Promise<number> {
    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const result = await this.db
      .prepare(`DELETE FROM activity_log WHERE created_at < ?`)
      .bind(cutoff)
      .run();

    return result.meta.changes ?? 0;
  }
}
