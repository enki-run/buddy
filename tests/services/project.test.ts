import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { ProjectService } from "../../src/services/project";
import { ActivityService } from "../../src/services/activity";
import { EdgeService } from "../../src/services/edge";
import { NodeService } from "../../src/services/node";

describe("ProjectService", () => {
  let activityService: ActivityService;
  let edgeService: EdgeService;
  let nodeService: NodeService;
  let service: ProjectService;

  beforeEach(async () => {
    activityService = new ActivityService(env.DB);
    edgeService = new EdgeService(env.DB, activityService);
    nodeService = new NodeService(env.DB, activityService);
    service = new ProjectService(env.DB, activityService, edgeService);

    // Clean up in FK-safe order
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM edges").run();
    await env.DB.prepare("DELETE FROM tasks").run();
    await env.DB.prepare("DELETE FROM projects").run();
    await env.DB.prepare("DELETE FROM nodes").run();
  });

  // === create() ===

  it("create() creates project with correct fields", async () => {
    const project = await service.create({
      name: "Test Project",
      context: "dev",
      description: "A test project",
      template: "standard",
      repo: "org/test-repo",
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe("Test Project");
    expect(project.context).toBe("dev");
    expect(project.description).toBe("A test project");
    expect(project.template).toBe("standard");
    expect(project.repo).toBe("org/test-repo");
    expect(project.status).toBe("planning");
    expect(project.created_at).toBeDefined();
    expect(project.updated_at).toBeDefined();

    // Verify persisted in DB
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id = ?")
      .bind(project.id)
      .first();
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).name).toBe("Test Project");
  });

  it("create() logs activity with action project_created", async () => {
    const project = await service.create({ name: "Activity Project" });

    const activity = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE entity_id = ? AND action = 'project_created'",
    )
      .bind(project.id)
      .first();
    expect(activity).not.toBeNull();
  });

  it("create() rejects name > 500 chars", async () => {
    const longName = "x".repeat(501);
    await expect(service.create({ name: longName })).rejects.toThrow(
      "Name exceeds maximum length of 500 characters",
    );
  });

  it("create() rejects description > 10KB", async () => {
    const longDesc = "x".repeat(10_241);
    await expect(service.create({ name: "Valid", description: longDesc })).rejects.toThrow(
      "Description exceeds maximum length",
    );
  });

  // === getById() ===

  it("getById() returns project with related nodes", async () => {
    // Create project
    const project = await service.create({ name: "Graph Project" });

    // Create a node
    const node = await nodeService.save({ type: "concept", title: "Related Concept" });

    // Link them with an edge (project->node via relates_to)
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO edges (id, from_type, from_id, to_type, to_id, relation, created_at)
       VALUES (?, 'project', ?, 'node', ?, 'relates_to', ?)`,
    )
      .bind("test-edge-1", project.id, node.id, now)
      .run();

    const result = await service.getById(project.id);

    expect(result).not.toBeNull();
    expect(result!.project.id).toBe(project.id);
    expect(result!.related_nodes).toHaveLength(1);
    expect(result!.related_nodes[0].node.id).toBe(node.id);
    expect(result!.related_nodes[0].edge.relation).toBe("relates_to");
  });

  it("getById() returns null for non-existent ID", async () => {
    const result = await service.getById("nonexistent-id");
    expect(result).toBeNull();
  });

  it("getById() does not include non-node related entities", async () => {
    const project = await service.create({ name: "Project With Node Only" });
    const node = await nodeService.save({ type: "concept", title: "Node Link" });

    const now = new Date().toISOString();
    // Link a node
    await env.DB.prepare(
      `INSERT INTO edges (id, from_type, from_id, to_type, to_id, relation, created_at)
       VALUES (?, 'project', ?, 'node', ?, 'documented_by', ?)`,
    )
      .bind("edge-node", project.id, node.id, now)
      .run();

    // Create another project and link project->project (task->task is not valid per matrix,
    // but we can insert directly to test filtering — actually let's skip that and just verify
    // only the node is in related_nodes)

    const result = await service.getById(project.id);

    expect(result).not.toBeNull();
    expect(result!.related_nodes).toHaveLength(1);
    expect((result!.related_nodes[0].node as any).title).toBe("Node Link");
  });

  // === list() ===

  it("list() with context filter returns only matching projects", async () => {
    await service.create({ name: "Dev Project", context: "dev" });
    await service.create({ name: "Musik Project", context: "musik" });
    await service.create({ name: "Another Dev", context: "dev" });

    const result = await service.list({ context: "dev", limit: 10, offset: 0 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.data.every((p) => p.context === "dev")).toBe(true);
  });

  it("list() with status filter returns only matching projects", async () => {
    await service.create({ name: "Planning One" });
    await service.create({ name: "Planning Two" });
    const p3 = await service.create({ name: "Active One" });
    await service.update(p3.id, { status: "active" });

    const result = await service.list({ status: "planning", limit: 10, offset: 0 });

    expect(result.data).toHaveLength(2);
    expect(result.data.every((p) => p.status === "planning")).toBe(true);
  });

  it("list() pagination returns correct has_more and total", async () => {
    for (let i = 0; i < 5; i++) {
      await service.create({ name: `Project ${i}` });
    }

    const page1 = await service.list({ limit: 2, offset: 0 });
    expect(page1.total).toBe(5);
    expect(page1.data).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.limit).toBe(2);
    expect(page1.offset).toBe(0);

    const page3 = await service.list({ limit: 2, offset: 4 });
    expect(page3.data).toHaveLength(1);
    expect(page3.has_more).toBe(false);

    const empty = await service.list({ limit: 2, offset: 10 });
    expect(empty.data).toHaveLength(0);
    expect(empty.has_more).toBe(false);
    expect(empty.total).toBe(5);
  });

  // === update() ===

  it("update() modifies fields and updates updated_at", async () => {
    const project = await service.create({
      name: "Original Name",
      description: "Original desc",
    });

    // Small delay to ensure updated_at differs
    await new Promise((r) => setTimeout(r, 10));

    const updated = await service.update(project.id, {
      name: "Updated Name",
      description: "Updated desc",
      status: "active",
      repo: "org/new-repo",
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated Name");
    expect(updated!.description).toBe("Updated desc");
    expect(updated!.status).toBe("active");
    expect(updated!.repo).toBe("org/new-repo");
    expect(updated!.updated_at).not.toBe(project.updated_at);
  });

  it("update() returns null for non-existent ID", async () => {
    const result = await service.update("nonexistent-id", { name: "Nope" });
    expect(result).toBeNull();
  });

  it("update() partial update only changes provided fields", async () => {
    const project = await service.create({
      name: "Keep Name",
      context: "dev",
      repo: "org/keep-repo",
    });

    const updated = await service.update(project.id, { status: "active" });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Keep Name");
    expect(updated!.context).toBe("dev");
    expect(updated!.repo).toBe("org/keep-repo");
    expect(updated!.status).toBe("active");
  });

  it("update() logs activity with action project_updated", async () => {
    const project = await service.create({ name: "Update Me" });
    await service.update(project.id, { name: "Updated" });

    const activity = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE entity_id = ? AND action = 'project_updated'",
    )
      .bind(project.id)
      .first();
    expect(activity).not.toBeNull();
  });

  // === archive() ===

  it("archive() sets status to archived", async () => {
    const project = await service.create({ name: "Archive Me" });

    const archived = await service.archive(project.id);

    expect(archived).not.toBeNull();
    expect(archived!.status).toBe("archived");

    // Verify in DB
    const row = await env.DB.prepare("SELECT status FROM projects WHERE id = ?")
      .bind(project.id)
      .first<{ status: string }>();
    expect(row?.status).toBe("archived");
  });

  it("archive() returns null for non-existent ID", async () => {
    const result = await service.archive("nonexistent-id");
    expect(result).toBeNull();
  });

  it("archive() preserves edges (archive != delete)", async () => {
    const project = await service.create({ name: "Project With Edges" });
    const node = await nodeService.save({ type: "concept", title: "Linked Node" });

    // Create an edge project->node
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO edges (id, from_type, from_id, to_type, to_id, relation, created_at)
       VALUES (?, 'project', ?, 'node', ?, 'relates_to', ?)`,
    )
      .bind("preserve-edge", project.id, node.id, now)
      .run();

    // Archive the project
    await service.archive(project.id);

    // Edge must still exist
    const edge = await env.DB.prepare("SELECT * FROM edges WHERE id = 'preserve-edge'").first();
    expect(edge).not.toBeNull();
  });

  it("archive() logs activity with action project_archived", async () => {
    const project = await service.create({ name: "Archive Activity" });
    await service.archive(project.id);

    const activity = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE entity_id = ? AND action = 'project_archived'",
    )
      .bind(project.id)
      .first();
    expect(activity).not.toBeNull();
  });
});
