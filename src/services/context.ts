import { VERSION } from "../types";
import type { ContextLoadResult } from "../types";
import type { CacheService } from "./cache";
import { HealthService } from "./health";

export class ContextService {
  private health: HealthService;
  constructor(private db: D1Database, private cache?: CacheService) {
    this.health = new HealthService(db);
  }

  async load(): Promise<ContextLoadResult> {
    // Try cache first
    if (this.cache) {
      const cached = await this.cache.get<ContextLoadResult>("context_load");
      if (cached) return cached;
    }

    // 6 parallel queries
    const [projects, tasksAttention, drafts, skills, recentActivity, stats] = await Promise.all([
      this.getActiveProjects(),
      this.getAttentionTasks(),
      this.getDraftNodes(),
      this.getSkillsCatalog(),
      this.getRecentActivity(),
      this.getStats(),
    ]);

    const result: ContextLoadResult = {
      version: VERSION,
      projects,
      tasks_attention: tasksAttention,
      drafts,
      skills,
      recent_activity: recentActivity,
      stats,
    };

    // Empty state hint
    if (stats.nodes === 0 && stats.projects === 0) {
      result.hint = "No data yet. Use save_node to create your first knowledge, or init_project to start a project.";
    }

    // Cache for 60s
    if (this.cache) {
      await this.cache.set("context_load", result, 60);
    }

    return result;
  }

  private async getActiveProjects() {
    const rows = await this.db.prepare(
      "SELECT id, name, context, status FROM projects WHERE status IN ('planning', 'active', 'paused') ORDER BY updated_at DESC"
    ).all();
    const projects = rows.results ?? [];
    return Promise.all(projects.map(async (r: any) => {
      const health = await this.health.calculate(r.id);
      return { id: r.id, name: r.name, context: r.context, status: r.status, health };
    }));
  }

  // Max 10, only overdue + in_progress + blocked
  private async getAttentionTasks() {
    const now = new Date().toISOString().split("T")[0];
    const rows = await this.db.prepare(`
      SELECT t.id, t.title, p.name as project_name, t.status, t.due_date
      FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.status IN ('in_progress', 'blocked')
         OR (t.due_date < ? AND t.status NOT IN ('done', 'cancelled'))
      ORDER BY t.due_date ASC NULLS LAST, t.priority ASC
      LIMIT 10
    `).bind(now).all();
    return (rows.results ?? []).map((r: any) => ({
      id: r.id, title: r.title, project_name: r.project_name, status: r.status, due_date: r.due_date
    }));
  }

  // Max 5 draft nodes
  private async getDraftNodes() {
    const rows = await this.db.prepare(
      "SELECT id, title, type, updated_at FROM nodes WHERE status = 'draft' ORDER BY updated_at DESC LIMIT 5"
    ).all();
    return (rows.results ?? []).map((r: any) => ({ id: r.id, title: r.title, type: r.type, updated_at: r.updated_at }));
  }

  // All template nodes — name + first line of content as description
  private async getSkillsCatalog() {
    const rows = await this.db.prepare(
      "SELECT title, content FROM nodes WHERE type = 'template' AND status = 'active' ORDER BY title ASC"
    ).all();
    return (rows.results ?? []).map((r: any) => ({
      name: r.title,
      description: r.content ? r.content.split("\n").find((l: string) => l.trim().length > 0)?.trim().slice(0, 200) ?? null : null
    }));
  }

  // Last 5 activity entries
  private async getRecentActivity() {
    const rows = await this.db.prepare(
      "SELECT action, summary, created_at FROM activity_log ORDER BY created_at DESC LIMIT 5"
    ).all();
    return (rows.results ?? []).map((r: any) => ({ action: r.action, summary: r.summary, created_at: r.created_at }));
  }

  private async getStats() {
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
