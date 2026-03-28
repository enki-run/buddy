import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { ContextService } from "../../src/services/context";
import { VERSION } from "../../src/types";

describe("ContextService", () => {
  let service: ContextService;

  beforeEach(async () => {
    service = new ContextService(env.DB);
    // Clean up in FK-safe order
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM edges").run();
    await env.DB.prepare("DELETE FROM tasks").run();
    await env.DB.prepare("DELETE FROM projects").run();
    await env.DB.prepare("DELETE FROM nodes").run();
  });

  // Helpers

  async function insertProject(id: string, name: string, status: string = "active", context: string | null = "dev"): Promise<void> {
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO projects (id, name, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, name, status, context, now, now).run();
  }

  async function insertTask(params: {
    id: string;
    title: string;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    projectId?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO tasks (id, project_id, title, status, priority, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      params.id,
      params.projectId ?? null,
      params.title,
      params.status ?? "backlog",
      params.priority ?? "medium",
      params.dueDate ?? null,
      now,
      now
    ).run();
  }

  async function insertNode(params: {
    id: string;
    title: string;
    type?: string;
    status?: string;
    content?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO nodes (id, type, title, content, status, encrypted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    ).bind(
      params.id,
      params.type ?? "concept",
      params.title,
      params.content ?? null,
      params.status ?? "active",
      now,
      now
    ).run();
  }

  async function insertActivity(action: string, summary: string | null = null): Promise<void> {
    const now = new Date().toISOString();
    const id = `act-${Math.random().toString(36).slice(2)}`;
    await env.DB.prepare(
      `INSERT INTO activity_log (id, project_id, action, entity_type, entity_id, summary, ip_hash, created_at)
       VALUES (?, NULL, ?, 'node', 'n1', ?, NULL, ?)`
    ).bind(id, action, summary, now).run();
  }

  // === Tests ===

  it("empty database returns hint message and correct version", async () => {
    const result = await service.load();

    expect(result.version).toBe(VERSION);
    expect(result.hint).toBeDefined();
    expect(result.hint).toContain("No data yet");
    expect(result.stats.nodes).toBe(0);
    expect(result.stats.projects).toBe(0);
    expect(result.stats.tasks_open).toBe(0);
    expect(result.stats.edges).toBe(0);
    expect(result.projects).toHaveLength(0);
    expect(result.tasks_attention).toHaveLength(0);
    expect(result.drafts).toHaveLength(0);
    expect(result.skills).toHaveLength(0);
    expect(result.recent_activity).toHaveLength(0);
  });

  it("with data returns projects, tasks, drafts, skills, activity, stats", async () => {
    // Insert project
    await insertProject("proj-1", "My Project", "active", "dev");

    // Insert task in_progress
    await insertTask({ id: "task-1", title: "Important Task", status: "in_progress", projectId: "proj-1" });

    // Insert draft node
    await insertNode({ id: "node-draft", title: "Draft Node", type: "concept", status: "draft" });

    // Insert active node (concept)
    await insertNode({ id: "node-active", title: "Active Concept", type: "concept", status: "active" });

    // Insert template node (for skills catalog)
    await insertNode({
      id: "node-tmpl",
      title: "My Template",
      type: "template",
      status: "active",
      content: "First line description\nSecond line"
    });

    // Insert activity
    await insertActivity("node_created", "Created something");

    const result = await service.load();

    expect(result.version).toBe(VERSION);
    expect(result.hint).toBeUndefined(); // has data, no hint

    // Projects
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].id).toBe("proj-1");
    expect(result.projects[0].name).toBe("My Project");
    expect(result.projects[0].status).toBe("active");

    // Tasks attention — in_progress task should appear
    expect(result.tasks_attention).toHaveLength(1);
    expect(result.tasks_attention[0].id).toBe("task-1");
    expect(result.tasks_attention[0].status).toBe("in_progress");

    // Drafts
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].id).toBe("node-draft");

    // Skills catalog — only template nodes
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe("My Template");
    expect(result.skills[0].description).toBe("First line description");

    // Activity
    expect(result.recent_activity).toHaveLength(1);
    expect(result.recent_activity[0].action).toBe("node_created");

    // Stats
    expect(result.stats.nodes).toBe(3); // draft + active + template
    expect(result.stats.projects).toBe(1);
    expect(result.stats.tasks_open).toBe(1); // in_progress counts
  });

  it("health score is calculated for all projects", async () => {
    await insertProject("proj-health", "Health Project", "active");

    const result = await service.load();

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].health).not.toBeNull();
    expect(result.projects[0].health!.score).toMatch(/^[A-F]$/);
    expect(result.projects[0].health!.points).toBeGreaterThanOrEqual(0);
    expect(result.projects[0].health!.points).toBeLessThanOrEqual(100);
    expect(result.projects[0].health!.factors).toHaveProperty("momentum");
    expect(result.projects[0].health!.factors).toHaveProperty("deadlines");
    expect(result.projects[0].health!.factors).toHaveProperty("freshness");
  });

  it("respects limit of 10 for attention tasks", async () => {
    await insertProject("proj-tasks", "Task Project", "active");
    const pastDate = "2020-01-01"; // overdue

    for (let i = 0; i < 15; i++) {
      await insertTask({
        id: `task-${i}`,
        title: `Overdue Task ${i}`,
        status: "todo",
        dueDate: pastDate,
        projectId: "proj-tasks",
      });
    }

    const result = await service.load();

    expect(result.tasks_attention.length).toBeLessThanOrEqual(10);
  });

  it("respects limit of 5 for drafts", async () => {
    for (let i = 0; i < 8; i++) {
      await insertNode({ id: `draft-${i}`, title: `Draft ${i}`, type: "concept", status: "draft" });
    }

    const result = await service.load();

    expect(result.drafts).toHaveLength(5);
  });

  it("respects limit of 5 for recent_activity", async () => {
    for (let i = 0; i < 8; i++) {
      await insertActivity(`action_${i}`, `Summary ${i}`);
    }

    const result = await service.load();

    expect(result.recent_activity).toHaveLength(5);
  });

  it("only active/planning/paused projects appear (not archived or done)", async () => {
    await insertProject("proj-active", "Active", "active");
    await insertProject("proj-planning", "Planning", "planning");
    await insertProject("proj-paused", "Paused", "paused");
    await insertProject("proj-done", "Done", "done");
    await insertProject("proj-archived", "Archived", "archived");

    const result = await service.load();

    const projectIds = result.projects.map((p) => p.id);
    expect(projectIds).toContain("proj-active");
    expect(projectIds).toContain("proj-planning");
    expect(projectIds).toContain("proj-paused");
    expect(projectIds).not.toContain("proj-done");
    expect(projectIds).not.toContain("proj-archived");
  });

  it("stats counts archived projects separately (not in active count)", async () => {
    await insertProject("proj-a", "Active", "active");
    await insertProject("proj-archived", "Archived", "archived");

    // Insert an active node so hint is not shown
    await insertNode({ id: "node-1", title: "Some node", type: "concept", status: "active" });

    const result = await service.load();

    // archived should not be counted in stats.projects
    expect(result.stats.projects).toBe(1);
  });

  it("skills catalog returns first non-empty line of content as description", async () => {
    await insertNode({
      id: "tmpl-1",
      title: "Template with blank first line",
      type: "template",
      status: "active",
      content: "\n\nActual description here\nMore content"
    });
    await insertNode({
      id: "tmpl-2",
      title: "Template with null content",
      type: "template",
      status: "active",
      content: null
    });

    const result = await service.load();

    expect(result.skills).toHaveLength(2);

    const tmpl1 = result.skills.find((s) => s.name === "Template with blank first line");
    expect(tmpl1?.description).toBe("Actual description here");

    const tmpl2 = result.skills.find((s) => s.name === "Template with null content");
    expect(tmpl2?.description).toBeNull();
  });

  it("attention tasks include blocked tasks", async () => {
    await insertProject("proj-blocked", "Blocked Project", "active");

    await insertTask({
      id: "task-blocked",
      title: "Blocked Task",
      status: "blocked",
      projectId: "proj-blocked",
    });

    const result = await service.load();

    const blockTask = result.tasks_attention.find((t) => t.id === "task-blocked");
    expect(blockTask).toBeDefined();
    expect(blockTask?.status).toBe("blocked");
  });

  it("done and cancelled tasks do not appear in tasks_attention", async () => {
    await insertProject("proj-done-tasks", "Done Project", "active");

    await insertTask({ id: "task-done", title: "Done Task", status: "done", projectId: "proj-done-tasks" });
    await insertTask({ id: "task-cancelled", title: "Cancelled Task", status: "cancelled", projectId: "proj-done-tasks" });

    const result = await service.load();

    const ids = result.tasks_attention.map((t) => t.id);
    expect(ids).not.toContain("task-done");
    expect(ids).not.toContain("task-cancelled");
  });
});
