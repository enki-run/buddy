export class SearchService {
  constructor(private db: D1Database) {}

  async search(query: string, limit: number = 20): Promise<Array<{ type: string; id: string; title: string; match: string }>> {
    if (!query || query.length < 2) return [];
    const results: Array<{ type: string; id: string; title: string; match: string }> = [];
    const pattern = `%${query}%`;

    // FTS5 on nodes
    try {
      const nodes = await this.db.prepare(
        `SELECT n.id, n.title, n.type FROM nodes n
         JOIN nodes_fts f ON n.rowid = f.rowid
         WHERE nodes_fts MATCH ?
         ORDER BY rank LIMIT ?`
      ).bind(query, limit).all<{ id: string; title: string; type: string }>();
      for (const n of nodes.results ?? []) {
        results.push({ type: `node:${n.type}`, id: n.id, title: n.title, match: "fts" });
      }
    } catch {
      // Malformed FTS5 query — fall back to LIKE search on nodes
      const likePattern = `%${query}%`;
      const nodes = await this.db.prepare(
        "SELECT id, title, type FROM nodes WHERE title LIKE ? OR content LIKE ? LIMIT ?"
      ).bind(likePattern, likePattern, limit).all<{ id: string; title: string; type: string }>();
      for (const n of nodes.results ?? []) {
        results.push({ type: `node:${n.type}`, id: n.id, title: n.title, match: "like" });
      }
    }

    // LIKE on projects
    const projects = await this.db.prepare(
      "SELECT id, name as title FROM projects WHERE name LIKE ? LIMIT ?"
    ).bind(pattern, limit).all<{ id: string; title: string }>();
    for (const p of projects.results ?? []) {
      results.push({ type: "project", id: p.id, title: p.title, match: "like" });
    }

    // LIKE on tasks
    const tasks = await this.db.prepare(
      "SELECT id, title FROM tasks WHERE title LIKE ? LIMIT ?"
    ).bind(pattern, limit).all<{ id: string; title: string }>();
    for (const t of tasks.results ?? []) {
      results.push({ type: "task", id: t.id, title: t.title, match: "like" });
    }

    return results.slice(0, limit);
  }
}
