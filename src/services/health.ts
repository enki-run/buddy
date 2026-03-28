import type { HealthScore } from "../types";

export class HealthService {
  constructor(private db: D1Database) {}

  async calculate(projectId: string): Promise<HealthScore> {
    // Run 3 queries in parallel
    const [momentum, deadlines, freshness] = await Promise.all([
      this.calculateMomentum(projectId),
      this.calculateDeadlines(projectId),
      this.calculateFreshness(projectId),
    ]);

    const points = Math.round(momentum * 0.35 + deadlines * 0.35 + freshness * 0.30);
    const score = points >= 80 ? "A" : points >= 60 ? "B" : points >= 40 ? "C" : points >= 20 ? "D" : "F";

    return { score, points, factors: { momentum, deadlines, freshness } };
  }

  private async calculateMomentum(projectId: string): Promise<number> {
    // Tasks completed in last 14 days vs total tasks
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = await this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = 'done' AND completed_at >= ?) as recent_done,
        (SELECT COUNT(*) FROM tasks WHERE project_id = ?) as total
    `).bind(projectId, fourteenDaysAgo, projectId).first<{ recent_done: number; total: number }>();
    if (!result || result.total === 0) return 100; // No tasks = healthy
    return Math.round((result.recent_done / Math.max(result.total, 1)) * 100);
  }

  private async calculateDeadlines(projectId: string): Promise<number> {
    // Non-overdue vs total with due_date
    const now = new Date().toISOString().split("T")[0];
    const result = await this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND due_date IS NOT NULL AND due_date < ? AND status NOT IN ('done', 'cancelled')) as overdue,
        (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND due_date IS NOT NULL) as total_with_due
    `).bind(projectId, now, projectId).first<{ overdue: number; total_with_due: number }>();
    if (!result || result.total_with_due === 0) return 100; // No deadlines = healthy
    return Math.round(((result.total_with_due - result.overdue) / result.total_with_due) * 100);
  }

  private async calculateFreshness(projectId: string): Promise<number> {
    // Based on days since last activity, decays over 30 days
    const result = await this.db.prepare(
      "SELECT MAX(created_at) as last_activity FROM activity_log WHERE project_id = ?"
    ).bind(projectId).first<{ last_activity: string | null }>();
    if (!result?.last_activity) return 50; // No activity = neutral
    const daysSince = (Date.now() - new Date(result.last_activity).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince <= 1) return 100;
    if (daysSince >= 30) return 0;
    return Math.round(100 - (daysSince / 30) * 100);
  }
}
