import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EdgeService } from "../../src/services/edge";
import { ActivityService } from "../../src/services/activity";

// Helper: insert a node directly via DB
async function insertNode(id: string, title = "Test Node"): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO nodes (id, type, title, content, tags, context, status, encrypted, created_at, updated_at)
     VALUES (?, 'concept', ?, NULL, NULL, NULL, 'active', 0, ?, ?)`,
  )
    .bind(id, title, now, now)
    .run();
}

// Helper: insert a project directly via DB
async function insertProject(id: string, name = "Test Project"): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO projects (id, name, description, context, status, template, repo, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, 'active', NULL, NULL, ?, ?)`,
  )
    .bind(id, name, now, now)
    .run();
}

// Helper: insert a task directly via DB
async function insertTask(id: string, title = "Test Task"): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO tasks (id, project_id, title, description, status, priority, due_date, tags, is_milestone, recurring, context, created_at, updated_at, completed_at)
     VALUES (?, NULL, ?, NULL, 'todo', 'medium', NULL, NULL, 0, NULL, NULL, ?, ?, NULL)`,
  )
    .bind(id, title, now, now)
    .run();
}

describe("EdgeService", () => {
  let service: EdgeService;
  let activityService: ActivityService;

  beforeEach(async () => {
    activityService = new ActivityService(env.DB);
    service = new EdgeService(env.DB, activityService);
    // Clean up in FK-safe order
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM edges").run();
    await env.DB.prepare("DELETE FROM tasks").run();
    await env.DB.prepare("DELETE FROM projects").run();
    await env.DB.prepare("DELETE FROM nodes").run();
  });

  // === link() ===

  it("link() creates an edge between two existing nodes", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    const edge = await service.link({
      from_type: "node",
      from_id: "node-a",
      to_type: "node",
      to_id: "node-b",
      relation: "relates_to",
    });

    expect(edge.id).toBeDefined();
    expect(edge.from_type).toBe("node");
    expect(edge.from_id).toBe("node-a");
    expect(edge.to_type).toBe("node");
    expect(edge.to_id).toBe("node-b");
    expect(edge.relation).toBe("relates_to");
    expect(edge.note).toBeNull();
    expect(edge.created_at).toBeDefined();

    // Verify DB persistence
    const row = await env.DB.prepare("SELECT * FROM edges WHERE id = ?")
      .bind(edge.id)
      .first();
    expect(row).not.toBeNull();
  });

  it("link() rejects invalid relation for entity types (depends_on from project to node)", async () => {
    await insertProject("proj-1", "My Project");
    await insertNode("node-a", "Node A");

    await expect(
      service.link({
        from_type: "project",
        from_id: "proj-1",
        to_type: "node",
        to_id: "node-a",
        relation: "depends_on",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("link() rejects edge to non-existent entity (NOT_FOUND)", async () => {
    await insertNode("node-a", "Node A");

    await expect(
      service.link({
        from_type: "node",
        from_id: "node-a",
        to_type: "node",
        to_id: "nonexistent-node",
        relation: "relates_to",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("link() rejects edge from non-existent entity (NOT_FOUND)", async () => {
    await insertNode("node-b", "Node B");

    await expect(
      service.link({
        from_type: "node",
        from_id: "nonexistent-node",
        to_type: "node",
        to_id: "node-b",
        relation: "relates_to",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("link() rejects duplicate edge (CONFLICT)", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    await service.link({
      from_type: "node",
      from_id: "node-a",
      to_type: "node",
      to_id: "node-b",
      relation: "relates_to",
    });

    await expect(
      service.link({
        from_type: "node",
        from_id: "node-a",
        to_type: "node",
        to_id: "node-b",
        relation: "relates_to",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("link() creates edge between project and node (relates_to)", async () => {
    await insertProject("proj-1", "My Project");
    await insertNode("node-a", "Node A");

    const edge = await service.link({
      from_type: "project",
      from_id: "proj-1",
      to_type: "node",
      to_id: "node-a",
      relation: "relates_to",
    });

    expect(edge.from_type).toBe("project");
    expect(edge.from_id).toBe("proj-1");
    expect(edge.to_type).toBe("node");
    expect(edge.to_id).toBe("node-a");
    expect(edge.relation).toBe("relates_to");
  });

  it("link() validates note length (> 1000 chars rejected)", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    const longNote = "x".repeat(1001);
    await expect(
      service.link({
        from_type: "node",
        from_id: "node-a",
        to_type: "node",
        to_id: "node-b",
        relation: "relates_to",
        note: longNote,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("link() stores note when provided", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    const edge = await service.link({
      from_type: "node",
      from_id: "node-a",
      to_type: "node",
      to_id: "node-b",
      relation: "relates_to",
      note: "This is a note",
    });

    expect(edge.note).toBe("This is a note");
  });

  it("link() logs activity with action edge_created", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    const edge = await service.link({
      from_type: "node",
      from_id: "node-a",
      to_type: "node",
      to_id: "node-b",
      relation: "relates_to",
    });

    const activity = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE entity_id = ? AND action = 'edge_created'",
    )
      .bind(edge.id)
      .first();
    expect(activity).not.toBeNull();
  });

  // === getRelated() ===

  it("getRelated() returns outgoing connections", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");
    await insertNode("node-c", "Node C");

    await service.link({ from_type: "node", from_id: "node-a", to_type: "node", to_id: "node-b", relation: "relates_to" });
    await service.link({ from_type: "node", from_id: "node-a", to_type: "node", to_id: "node-c", relation: "depends_on" });
    // Incoming edge (should not appear in outgoing)
    await service.link({ from_type: "node", from_id: "node-b", to_type: "node", to_id: "node-a", relation: "relates_to" });

    const result = await service.getRelated({
      entity_type: "node",
      entity_id: "node-a",
      direction: "outgoing",
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    const entityIds = result.data.map((d) => d.entity.id);
    expect(entityIds).toContain("node-b");
    expect(entityIds).toContain("node-c");
    expect(entityIds).not.toContain("node-a");
  });

  it("getRelated() returns incoming connections", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");
    await insertNode("node-c", "Node C");

    await service.link({ from_type: "node", from_id: "node-b", to_type: "node", to_id: "node-a", relation: "relates_to" });
    await service.link({ from_type: "node", from_id: "node-c", to_type: "node", to_id: "node-a", relation: "depends_on" });
    // Outgoing (should not appear in incoming)
    await service.link({ from_type: "node", from_id: "node-a", to_type: "node", to_id: "node-b", relation: "supersedes" });

    const result = await service.getRelated({
      entity_type: "node",
      entity_id: "node-a",
      direction: "incoming",
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    const entityIds = result.data.map((d) => d.entity.id);
    expect(entityIds).toContain("node-b");
    expect(entityIds).toContain("node-c");
  });

  it("getRelated() returns both directions by default", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");
    await insertNode("node-c", "Node C");

    await service.link({ from_type: "node", from_id: "node-a", to_type: "node", to_id: "node-b", relation: "relates_to" });
    await service.link({ from_type: "node", from_id: "node-c", to_type: "node", to_id: "node-a", relation: "depends_on" });

    const result = await service.getRelated({
      entity_type: "node",
      entity_id: "node-a",
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    const entityIds = result.data.map((d) => d.entity.id);
    expect(entityIds).toContain("node-b");
    expect(entityIds).toContain("node-c");
  });

  it("getRelated() filters by relation type", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");
    await insertNode("node-c", "Node C");

    await service.link({ from_type: "node", from_id: "node-a", to_type: "node", to_id: "node-b", relation: "relates_to" });
    await service.link({ from_type: "node", from_id: "node-a", to_type: "node", to_id: "node-c", relation: "depends_on" });

    const result = await service.getRelated({
      entity_type: "node",
      entity_id: "node-a",
      relation: "depends_on",
      direction: "outgoing",
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].edge.relation).toBe("depends_on");
    expect(result.data[0].entity.id).toBe("node-c");
  });

  it("getRelated() returns paginated results", async () => {
    await insertNode("node-a", "Node A");
    for (let i = 0; i < 5; i++) {
      await insertNode(`node-${i}`, `Node ${i}`);
      await service.link({
        from_type: "node",
        from_id: "node-a",
        to_type: "node",
        to_id: `node-${i}`,
        relation: "relates_to",
      });
    }

    const page1 = await service.getRelated({
      entity_type: "node",
      entity_id: "node-a",
      direction: "outgoing",
      limit: 2,
      offset: 0,
    });

    expect(page1.total).toBe(5);
    expect(page1.data).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.limit).toBe(2);
    expect(page1.offset).toBe(0);

    const page3 = await service.getRelated({
      entity_type: "node",
      entity_id: "node-a",
      direction: "outgoing",
      limit: 2,
      offset: 4,
    });
    expect(page3.data).toHaveLength(1);
    expect(page3.has_more).toBe(false);
  });

  it("getRelated() returns full entity objects alongside edges", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    await service.link({ from_type: "node", from_id: "node-a", to_type: "node", to_id: "node-b", relation: "relates_to" });

    const result = await service.getRelated({
      entity_type: "node",
      entity_id: "node-a",
      direction: "outgoing",
      limit: 10,
      offset: 0,
    });

    expect(result.data).toHaveLength(1);
    const { entity, edge } = result.data[0];
    expect(entity.id).toBe("node-b");
    expect((entity as { title: string }).title).toBe("Node B");
    expect(edge.relation).toBe("relates_to");
  });

  it("getRelated() works with mixed entity types (project -> node)", async () => {
    await insertProject("proj-1", "My Project");
    await insertNode("node-a", "Node A");

    await service.link({ from_type: "project", from_id: "proj-1", to_type: "node", to_id: "node-a", relation: "relates_to" });

    const result = await service.getRelated({
      entity_type: "project",
      entity_id: "proj-1",
      direction: "outgoing",
      limit: 10,
      offset: 0,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].entity.id).toBe("node-a");
    expect(result.data[0].edge.relation).toBe("relates_to");
  });

  // === deleteEdge() ===

  it("deleteEdge() removes an edge and returns true", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    const edge = await service.link({
      from_type: "node",
      from_id: "node-a",
      to_type: "node",
      to_id: "node-b",
      relation: "relates_to",
    });

    const result = await service.deleteEdge(edge.id);

    expect(result).toBe(true);

    const row = await env.DB.prepare("SELECT * FROM edges WHERE id = ?")
      .bind(edge.id)
      .first();
    expect(row).toBeNull();
  });

  it("deleteEdge() returns false for non-existent ID", async () => {
    const result = await service.deleteEdge("nonexistent-edge-id");
    expect(result).toBe(false);
  });

  it("deleteEdge() logs activity with action edge_deleted", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    const edge = await service.link({
      from_type: "node",
      from_id: "node-a",
      to_type: "node",
      to_id: "node-b",
      relation: "relates_to",
    });

    await service.deleteEdge(edge.id);

    const activity = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE entity_id = ? AND action = 'edge_deleted'",
    )
      .bind(edge.id)
      .first();
    expect(activity).not.toBeNull();
  });

  // === cleanupForEntity() ===

  it("cleanupForEntity() removes all edges referencing an entity", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");
    await insertNode("node-c", "Node C");

    await service.link({ from_type: "node", from_id: "node-a", to_type: "node", to_id: "node-b", relation: "relates_to" });
    await service.link({ from_type: "node", from_id: "node-c", to_type: "node", to_id: "node-a", relation: "depends_on" });
    // Edge not involving node-a
    await service.link({ from_type: "node", from_id: "node-b", to_type: "node", to_id: "node-c", relation: "relates_to" });

    const deleted = await service.cleanupForEntity("node", "node-a");

    expect(deleted).toBe(2);

    // Edges involving node-a should be gone
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM edges WHERE from_id = 'node-a' OR to_id = 'node-a'",
    ).first<{ total: number }>();
    expect(remaining?.total).toBe(0);

    // Edge between node-b and node-c should remain
    const unrelated = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM edges WHERE from_id = 'node-b' AND to_id = 'node-c'",
    ).first<{ total: number }>();
    expect(unrelated?.total).toBe(1);
  });

  it("cleanupForEntity() returns 0 when no edges reference the entity", async () => {
    await insertNode("node-a", "Node A");

    const deleted = await service.cleanupForEntity("node", "node-a");

    expect(deleted).toBe(0);
  });

  it("cleanupForEntity() does not log activity (cascade helper)", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    await service.link({ from_type: "node", from_id: "node-a", to_type: "node", to_id: "node-b", relation: "relates_to" });

    // Clear all activity so far
    await env.DB.prepare("DELETE FROM activity_log").run();

    await service.cleanupForEntity("node", "node-a");

    const activityCount = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM activity_log",
    ).first<{ total: number }>();
    expect(activityCount?.total).toBe(0);
  });
});
