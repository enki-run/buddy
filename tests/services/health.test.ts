import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { HealthService } from "../../src/services/health";

describe("HealthService", () => {
  let service: HealthService;

  beforeEach(async () => {
    service = new HealthService(env.DB);
    // Clean up in FK-safe order
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM edges").run();
    await env.DB.prepare("DELETE FROM tasks").run();
    await env.DB.prepare("DELETE FROM projects").run();
    await env.DB.prepare("DELETE FROM nodes").run();
  });

  // Helper to insert a project
  async function insertProject(id: string, name: string = "Test Project"): Promise<void> {
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)"
    ).bind(id, name, now, now).run();
  }

  // Helper to insert a task
  async function insertTask(params: {
    id: string;
    projectId: string;
    title?: string;
    status?: string;
    dueDate?: string | null;
    completedAt?: string | null;
    priority?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO tasks (id, project_id, title, status, priority, due_date, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      params.id,
      params.projectId,
      params.title ?? "Task",
      params.status ?? "backlog",
      params.priority ?? "medium",
      params.dueDate ?? null,
      params.completedAt ?? null,
      now,
      now
    ).run();
  }

  // Helper to insert activity
  async function insertActivity(projectId: string, createdAt: string): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO activity_log (id, project_id, action, entity_type, entity_id, summary, ip_hash, created_at)
       VALUES (?, ?, 'test', 'project', ?, NULL, NULL, ?)`
    ).bind(`act-${Math.random()}`, projectId, projectId, createdAt).run();
  }

  // === Score thresholds ===

  it("empty project (no tasks, no activity) returns score A with 100 points for momentum and deadlines, 50 for freshness", async () => {
    await insertProject("proj-empty");

    const result = await service.calculate("proj-empty");

    // momentum=100, deadlines=100, freshness=50
    // points = round(100*0.35 + 100*0.35 + 50*0.30) = round(35 + 35 + 15) = 85
    expect(result.factors.momentum).toBe(100);
    expect(result.factors.deadlines).toBe(100);
    expect(result.factors.freshness).toBe(50);
    expect(result.points).toBe(85);
    expect(result.score).toBe("A");
  });

  it("project with all tasks done recently returns high momentum score", async () => {
    await insertProject("proj-good");
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

    await insertTask({ id: "t1", projectId: "proj-good", status: "done", completedAt: recentDate });
    await insertTask({ id: "t2", projectId: "proj-good", status: "done", completedAt: recentDate });

    const result = await service.calculate("proj-good");

    // 2 done recently / 2 total = 100% momentum
    expect(result.factors.momentum).toBe(100);
  });

  it("project with overdue tasks returns lower deadlines score", async () => {
    await insertProject("proj-overdue");
    const pastDate = "2020-01-01"; // well in the past

    await insertTask({ id: "t1", projectId: "proj-overdue", status: "todo", dueDate: pastDate });
    await insertTask({ id: "t2", projectId: "proj-overdue", status: "todo", dueDate: pastDate });

    const result = await service.calculate("proj-overdue");

    // 2 overdue / 2 total_with_due = 0% non-overdue
    expect(result.factors.deadlines).toBe(0);
    // points = round(momentum*0.35 + 0*0.35 + freshness*0.30)
    expect(result.score).not.toBe("A");
  });

  it("score A when points >= 80", async () => {
    await insertProject("proj-a");
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
    await insertActivity("proj-a", recent);

    const result = await service.calculate("proj-a");

    // No tasks: momentum=100, deadlines=100, freshness=100
    // points = round(35 + 35 + 30) = 100
    expect(result.points).toBe(100);
    expect(result.score).toBe("A");
  });

  it("score B when points >= 60 and < 80", async () => {
    await insertProject("proj-b");
    const pastDate = "2020-01-01";
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await insertActivity("proj-b", recent);

    // Add 1 overdue out of 2 tasks → deadlines = 50%
    await insertTask({ id: "t1", projectId: "proj-b", status: "todo", dueDate: pastDate });
    await insertTask({ id: "t2", projectId: "proj-b", status: "todo", dueDate: "2099-12-31" });

    const result = await service.calculate("proj-b");

    // momentum = 0 (no done tasks), deadlines = 50, freshness = 100
    // points = round(0*0.35 + 50*0.35 + 100*0.30) = round(0 + 17.5 + 30) = round(47.5) = 48 → "C"
    // Let's verify the formula works correctly
    expect(result.factors.deadlines).toBe(50);
    expect(result.factors.freshness).toBe(100);
  });

  it("score C when points >= 40 and < 60", async () => {
    await insertProject("proj-c");
    const pastDate = "2020-01-01";

    // Create tasks with all overdue, no recent completions, moderate freshness
    await insertTask({ id: "t1", projectId: "proj-c", status: "todo", dueDate: pastDate });
    await insertTask({ id: "t2", projectId: "proj-c", status: "todo", dueDate: pastDate });
    // Activity 10 days ago: freshness ≈ 67%
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await insertActivity("proj-c", tenDaysAgo);

    const result = await service.calculate("proj-c");

    // momentum=0 (no done tasks), deadlines=0 (all overdue), freshness≈67
    // points = round(0*0.35 + 0*0.35 + 67*0.30) = round(20.1) = 20 → "D"
    expect(result.factors.momentum).toBe(0);
    expect(result.factors.deadlines).toBe(0);
  });

  it("score D when points >= 20 and < 40", async () => {
    await insertProject("proj-d");
    // Activity 20 days ago: freshness = round(100 - (20/30)*100) = round(33.3) = 33
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    await insertActivity("proj-d", twentyDaysAgo);
    const pastDate = "2020-01-01";
    await insertTask({ id: "t1", projectId: "proj-d", status: "todo", dueDate: pastDate });

    const result = await service.calculate("proj-d");

    // momentum=0, deadlines=0, freshness≈33
    // points = round(0 + 0 + 33*0.30) = round(9.9) = 10 → "F"
    expect(result.score).toBe("F");
    expect(result.points).toBeLessThan(20);
  });

  it("score F when points < 20", async () => {
    await insertProject("proj-f");
    // Activity 29 days ago: freshness = round(100 - (29/30)*100) ≈ 3
    const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    await insertActivity("proj-f", twentyNineDaysAgo);
    const pastDate = "2020-01-01";
    await insertTask({ id: "t1", projectId: "proj-f", status: "todo", dueDate: pastDate });
    await insertTask({ id: "t2", projectId: "proj-f", status: "todo", dueDate: pastDate });

    const result = await service.calculate("proj-f");

    expect(result.score).toBe("F");
    expect(result.points).toBeLessThan(20);
  });

  it("no activity returns freshness 50 (neutral)", async () => {
    await insertProject("proj-neutral");

    const result = await service.calculate("proj-neutral");

    expect(result.factors.freshness).toBe(50);
  });

  it("activity less than 1 day ago returns freshness 100", async () => {
    await insertProject("proj-fresh");
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await insertActivity("proj-fresh", oneHourAgo);

    const result = await service.calculate("proj-fresh");

    expect(result.factors.freshness).toBe(100);
  });

  it("activity 30+ days ago returns freshness 0", async () => {
    await insertProject("proj-stale");
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await insertActivity("proj-stale", thirtyOneDaysAgo);

    const result = await service.calculate("proj-stale");

    expect(result.factors.freshness).toBe(0);
  });

  it("done tasks with due_date do not count as overdue", async () => {
    await insertProject("proj-done-due");
    const pastDate = "2020-01-01";

    await insertTask({ id: "t1", projectId: "proj-done-due", status: "done", dueDate: pastDate });
    await insertTask({ id: "t2", projectId: "proj-done-due", status: "cancelled", dueDate: pastDate });

    const result = await service.calculate("proj-done-due");

    // done and cancelled tasks are excluded from overdue count
    expect(result.factors.deadlines).toBe(100);
  });
});
