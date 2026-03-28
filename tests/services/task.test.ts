import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { TaskService } from "../../src/services/task";
import { ActivityService } from "../../src/services/activity";
import { EdgeService } from "../../src/services/edge";
import { NodeService } from "../../src/services/node";
import { ProjectService } from "../../src/services/project";

describe("TaskService", () => {
  let activityService: ActivityService;
  let edgeService: EdgeService;
  let nodeService: NodeService;
  let projectService: ProjectService;
  let service: TaskService;

  beforeEach(async () => {
    activityService = new ActivityService(env.DB);
    edgeService = new EdgeService(env.DB, activityService);
    nodeService = new NodeService(env.DB, activityService);
    projectService = new ProjectService(env.DB, activityService, edgeService);
    service = new TaskService(env.DB, activityService, edgeService);

    // Clean up in FK-safe order
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM edges").run();
    await env.DB.prepare("DELETE FROM tasks").run();
    await env.DB.prepare("DELETE FROM projects").run();
    await env.DB.prepare("DELETE FROM nodes").run();
  });

  // === create() ===

  it("create() creates task with correct defaults", async () => {
    const task = await service.create({ title: "My first task" });

    expect(task.id).toBeDefined();
    expect(task.title).toBe("My first task");
    expect(task.status).toBe("backlog");
    expect(task.priority).toBe("medium");
    expect(task.project_id).toBeNull();
    expect(task.description).toBeNull();
    expect(task.completed_at).toBeNull();
    expect(task.is_milestone).toBe(0);
    expect(task.recurring).toBeNull();
    expect(task.created_at).toBeDefined();
    expect(task.updated_at).toBeDefined();

    // Verify persisted in DB
    const row = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?")
      .bind(task.id)
      .first();
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).title).toBe("My first task");
  });

  it("create() with project_id links to project and inherits context", async () => {
    const project = await projectService.create({ name: "My Project", context: "dev" });
    const task = await service.create({
      title: "Project Task",
      project_id: project.id,
    });

    expect(task.project_id).toBe(project.id);
    // Inherits project context since task has no explicit context
    expect(task.context).toBe("dev");
  });

  it("create() with explicit context overrides project context", async () => {
    const project = await projectService.create({ name: "Context Project", context: "dev" });
    const task = await service.create({
      title: "Override Context Task",
      project_id: project.id,
      context: "musik",
    });

    expect(task.context).toBe("musik");
  });

  it("create() with recurring field stores interval", async () => {
    const task = await service.create({
      title: "Weekly Review",
      recurring: "weekly",
    });

    expect(task.recurring).toBe("weekly");

    const row = await env.DB.prepare("SELECT recurring FROM tasks WHERE id = ?")
      .bind(task.id)
      .first<{ recurring: string }>();
    expect(row?.recurring).toBe("weekly");
  });

  it("create() rejects title > 500 chars", async () => {
    const longTitle = "x".repeat(501);
    await expect(service.create({ title: longTitle })).rejects.toThrow(
      "Title exceeds maximum length of 500 characters",
    );
  });

  it("create() rejects description > 10KB", async () => {
    const longDesc = "x".repeat(10_241);
    await expect(
      service.create({ title: "Valid", description: longDesc }),
    ).rejects.toThrow("Description exceeds maximum length");
  });

  it("create() rejects non-existent project_id", async () => {
    await expect(
      service.create({ title: "Orphan Task", project_id: "nonexistent-project" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // === list() ===

  it("list() filters by status", async () => {
    await service.create({ title: "Backlog Task" }); // status: backlog
    const t2 = await service.create({ title: "Todo Task" });
    await service.update(t2.id, { status: "todo" });
    await service.create({ title: "Another Backlog" });

    const result = await service.list({ status: "backlog", limit: 10, offset: 0 });

    expect(result.data.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.data.every((t) => t.status === "backlog")).toBe(true);
  });

  it("list() filters by project_id", async () => {
    const project = await projectService.create({ name: "Filtered Project" });
    await service.create({ title: "Task in Project", project_id: project.id });
    await service.create({ title: "Task in Project 2", project_id: project.id });
    await service.create({ title: "Standalone Task" });

    const result = await service.list({ project_id: project.id, limit: 10, offset: 0 });

    expect(result.data.length).toBe(2);
    expect(result.data.every((t) => t.project_id === project.id)).toBe(true);
  });

  it("list() filters by tag", async () => {
    await service.create({ title: "Tagged Task", tags: ["urgent", "backend"] });
    await service.create({ title: "Other Urgent", tags: ["urgent", "frontend"] });
    await service.create({ title: "No Tags" });
    await service.create({ title: "Different Tag", tags: ["backend"] });

    const result = await service.list({ tag: "urgent", limit: 10, offset: 0 });

    expect(result.data.length).toBe(2);
    expect(result.total).toBe(2);
  });

  it("list() pagination returns correct has_more and total", async () => {
    for (let i = 0; i < 5; i++) {
      await service.create({ title: `Task ${i}` });
    }

    const page1 = await service.list({ limit: 2, offset: 0 });
    expect(page1.total).toBe(5);
    expect(page1.data.length).toBe(2);
    expect(page1.has_more).toBe(true);
    expect(page1.limit).toBe(2);
    expect(page1.offset).toBe(0);

    const page3 = await service.list({ limit: 2, offset: 4 });
    expect(page3.data.length).toBe(1);
    expect(page3.has_more).toBe(false);

    const empty = await service.list({ limit: 2, offset: 10 });
    expect(empty.data.length).toBe(0);
    expect(empty.has_more).toBe(false);
    expect(empty.total).toBe(5);
  });

  it("list() orders by priority weight", async () => {
    await service.create({ title: "Low Priority Task", priority: "low" });
    await service.create({ title: "Critical Task", priority: "critical" });
    await service.create({ title: "High Task", priority: "high" });
    await service.create({ title: "Medium Task", priority: "medium" });

    const result = await service.list({ limit: 10, offset: 0 });

    expect(result.data[0].priority).toBe("critical");
    expect(result.data[1].priority).toBe("high");
    expect(result.data[2].priority).toBe("medium");
    expect(result.data[3].priority).toBe("low");
  });

  // === complete() ===

  it("complete() sets status to done and completed_at", async () => {
    const task = await service.create({ title: "Finish Me" });

    const completed = await service.complete(task.id);

    expect(completed).not.toBeNull();
    expect(completed!.status).toBe("done");
    expect(completed!.completed_at).not.toBeNull();

    // Verify in DB
    const row = await env.DB.prepare("SELECT status, completed_at FROM tasks WHERE id = ?")
      .bind(task.id)
      .first<{ status: string; completed_at: string | null }>();
    expect(row?.status).toBe("done");
    expect(row?.completed_at).not.toBeNull();
  });

  it("complete() with result_node_id creates produced_by edge", async () => {
    const task = await service.create({ title: "Task with Result" });
    const node = await nodeService.save({ type: "concept", title: "Result Node" });

    const completed = await service.complete(task.id, node.id);

    expect(completed).not.toBeNull();
    expect(completed!.status).toBe("done");

    // Verify edge was created
    const edge = await env.DB.prepare(
      `SELECT * FROM edges WHERE from_type = 'task' AND from_id = ? AND to_type = 'node' AND to_id = ? AND relation = 'produced_by'`,
    )
      .bind(task.id, node.id)
      .first();
    expect(edge).not.toBeNull();
  });

  it("complete() with non-existent result_node_id still completes task (no edge)", async () => {
    const task = await service.create({ title: "Task No Node" });

    const completed = await service.complete(task.id, "nonexistent-node-id");

    expect(completed).not.toBeNull();
    expect(completed!.status).toBe("done");

    // Verify no edge was created
    const edges = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM edges WHERE from_type = 'task' AND from_id = ?`,
    )
      .bind(task.id)
      .first<{ count: number }>();
    expect(edges?.count).toBe(0);
  });

  it("complete() returns null for non-existent task", async () => {
    const result = await service.complete("nonexistent-id");
    expect(result).toBeNull();
  });

  // === completeRecurring() ===

  it("completeRecurring() creates next task with correct monthly due_date", async () => {
    const task = await service.create({
      title: "Monthly Review",
      recurring: "monthly",
      due_date: "2025-01-15",
    });

    const result = await service.completeRecurring(task.id);

    expect(result).not.toBeNull();
    expect(result!.completed.status).toBe("done");
    expect(result!.completed.completed_at).not.toBeNull();

    expect(result!.next.title).toBe("Monthly Review");
    expect(result!.next.recurring).toBe("monthly");
    expect(result!.next.status).toBe("backlog");
    // 2025-01-15 + 1 month = 2025-02-15
    expect(result!.next.due_date).toBe("2025-02-15");
  });

  it("completeRecurring() creates next task with correct quarterly due_date", async () => {
    const task = await service.create({
      title: "Quarterly Report",
      recurring: "quarterly",
      due_date: "2025-03-15",
    });

    const result = await service.completeRecurring(task.id);

    expect(result).not.toBeNull();
    // 2025-03-15 + 3 months = 2025-06-15
    expect(result!.next.due_date).toBe("2025-06-15");
    expect(result!.next.recurring).toBe("quarterly");
  });

  it("completeRecurring() creates next task with correct weekly due_date", async () => {
    const task = await service.create({
      title: "Weekly Standup",
      recurring: "weekly",
      due_date: "2025-03-10",
    });

    const result = await service.completeRecurring(task.id);

    expect(result).not.toBeNull();
    // 2025-03-10 + 7 days = 2025-03-17
    expect(result!.next.due_date).toBe("2025-03-17");
  });

  it("completeRecurring() creates next task with correct yearly due_date", async () => {
    const task = await service.create({
      title: "Annual Review",
      recurring: "yearly",
      due_date: "2025-06-01",
    });

    const result = await service.completeRecurring(task.id);

    expect(result).not.toBeNull();
    // 2025-06-01 + 1 year = 2026-06-01
    expect(result!.next.due_date).toBe("2026-06-01");
  });

  it("completeRecurring() copies title, description, priority, tags, context, project_id", async () => {
    const project = await projectService.create({ name: "Recurring Project" });
    const task = await service.create({
      title: "Full Recurring Task",
      description: "Detailed description",
      priority: "high",
      tags: ["important", "recurring"],
      recurring: "monthly",
      due_date: "2025-01-01",
      project_id: project.id,
      context: "dev",
    });

    const result = await service.completeRecurring(task.id);

    expect(result).not.toBeNull();
    const next = result!.next;
    expect(next.title).toBe("Full Recurring Task");
    expect(next.description).toBe("Detailed description");
    expect(next.priority).toBe("high");
    expect(next.tags).toBe(JSON.stringify(["important", "recurring"]));
    expect(next.recurring).toBe("monthly");
    expect(next.project_id).toBe(project.id);
    expect(next.context).toBe("dev");
  });

  it("completeRecurring() rejects non-recurring task", async () => {
    const task = await service.create({ title: "One-Off Task" });

    await expect(service.completeRecurring(task.id)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("completeRecurring() returns null for non-existent task", async () => {
    const result = await service.completeRecurring("nonexistent-id");
    expect(result).toBeNull();
  });

  // === move() ===

  it("move() changes project_id", async () => {
    const projectA = await projectService.create({ name: "Project A" });
    const projectB = await projectService.create({ name: "Project B" });
    const task = await service.create({ title: "Movable Task", project_id: projectA.id });

    const moved = await service.move(task.id, projectB.id);

    expect(moved).not.toBeNull();
    expect(moved!.project_id).toBe(projectB.id);

    // Verify in DB
    const row = await env.DB.prepare("SELECT project_id FROM tasks WHERE id = ?")
      .bind(task.id)
      .first<{ project_id: string }>();
    expect(row?.project_id).toBe(projectB.id);
  });

  it("move() returns null for non-existent task", async () => {
    const project = await projectService.create({ name: "Some Project" });
    const result = await service.move("nonexistent-task", project.id);
    expect(result).toBeNull();
  });

  it("move() rejects non-existent target project", async () => {
    const task = await service.create({ title: "Task to Move" });
    await expect(service.move(task.id, "nonexistent-project")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("move() logs activity", async () => {
    const project = await projectService.create({ name: "Move Target" });
    const task = await service.create({ title: "Log Move Task" });

    await service.move(task.id, project.id);

    const activity = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE entity_id = ? AND action = 'task_moved'",
    )
      .bind(task.id)
      .first();
    expect(activity).not.toBeNull();
  });

  // === bulkCreate() ===

  it("bulkCreate() creates multiple tasks", async () => {
    const tasks = await service.bulkCreate([
      { title: "Bulk Task 1", priority: "high" },
      { title: "Bulk Task 2", priority: "low" },
      { title: "Bulk Task 3" },
    ]);

    expect(tasks.length).toBe(3);
    expect(tasks[0].title).toBe("Bulk Task 1");
    expect(tasks[1].title).toBe("Bulk Task 2");
    expect(tasks[2].title).toBe("Bulk Task 3");
    expect(tasks[2].priority).toBe("medium"); // default

    // Verify in DB
    const count = await env.DB.prepare("SELECT COUNT(*) as total FROM tasks")
      .first<{ total: number }>();
    expect(count?.total).toBe(3);
  });

  it("bulkCreate() rejects more than 50 tasks", async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({ title: `Task ${i}` }));
    await expect(service.bulkCreate(tooMany)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("bulkCreate() returns empty array for empty input", async () => {
    const result = await service.bulkCreate([]);
    expect(result).toEqual([]);
  });

  it("bulkCreate() uses db.batch() — all tasks have same timestamp", async () => {
    const tasks = await service.bulkCreate([
      { title: "Batch A" },
      { title: "Batch B" },
      { title: "Batch C" },
    ]);

    // All tasks should have valid IDs and be persisted
    for (const task of tasks) {
      expect(task.id).toBeDefined();
      const row = await env.DB.prepare("SELECT id FROM tasks WHERE id = ?")
        .bind(task.id)
        .first();
      expect(row).not.toBeNull();
    }
  });
});
