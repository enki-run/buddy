export class StatsService {
  constructor(private db: D1Database) {}

  async getStats(): Promise<{ nodes: number; projects: number; tasks_open: number; edges: number }> {
    const result = await this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM nodes) as nodes,
        (SELECT COUNT(*) FROM projects WHERE status != 'archived') as projects,
        (SELECT COUNT(*) FROM tasks WHERE status NOT IN ('done', 'cancelled')) as tasks_open,
        (SELECT COUNT(*) FROM edges) as edges
    `).first<{ nodes: number; projects: number; tasks_open: number; edges: number }>();
    return result ?? { nodes: 0, projects: 0, tasks_open: 0, edges: 0 };
  }
}
