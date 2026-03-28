import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { IntegrityService } from "../../src/services/integrity";

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
async function insertProject(id: string, name = "Test Project", status = "active"): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO projects (id, name, description, context, status, template, repo, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, ?, NULL, NULL, ?, ?)`,
  )
    .bind(id, name, status, now, now)
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

// Helper: insert an edge directly via DB (bypasses EdgeService validation)
async function insertEdge(
  id: string,
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  relation: string,
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO edges (id, from_type, from_id, to_type, to_id, relation, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
  )
    .bind(id, fromType, fromId, toType, toId, relation, now)
    .run();
}

describe("IntegrityService", () => {
  let service: IntegrityService;

  beforeEach(async () => {
    service = new IntegrityService(env.DB);
    // Clean up in FK-safe order
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM edges").run();
    await env.DB.prepare("DELETE FROM tasks").run();
    await env.DB.prepare("DELETE FROM projects").run();
    await env.DB.prepare("DELETE FROM nodes").run();
  });

  it("empty graph (no edges) returns { valid: 0, orphaned: [], invalid: [] }", async () => {
    const report = await service.validate();

    expect(report.valid).toBe(0);
    expect(report.orphaned).toHaveLength(0);
    expect(report.invalid).toHaveLength(0);
  });

  it("all valid edges returns correct count and empty error arrays", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");
    await insertNode("node-c", "Node C");

    // Insert valid edges directly
    await insertEdge("edge-1", "node", "node-a", "node", "node-b", "relates_to");
    await insertEdge("edge-2", "node", "node-b", "node", "node-c", "depends_on");
    await insertEdge("edge-3", "node", "node-a", "node", "node-c", "supersedes");

    const report = await service.validate();

    expect(report.valid).toBe(3);
    expect(report.orphaned).toHaveLength(0);
    expect(report.invalid).toHaveLength(0);
  });

  it("orphaned edge detected when target entity is missing", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    // Insert a valid edge
    await insertEdge("edge-orphan", "node", "node-a", "node", "node-b", "relates_to");

    // Delete the target node directly (bypassing cascade to simulate orphan)
    await env.DB.prepare("DELETE FROM nodes WHERE id = ?").bind("node-b").run();

    const report = await service.validate();

    expect(report.valid).toBe(0);
    expect(report.orphaned).toHaveLength(1);
    expect(report.orphaned[0].id).toBe("edge-orphan");
    expect(report.invalid).toHaveLength(0);
  });

  it("orphaned edge detected when source entity is missing", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");

    await insertEdge("edge-orphan-src", "node", "node-a", "node", "node-b", "relates_to");

    // Delete the source node directly
    await env.DB.prepare("DELETE FROM nodes WHERE id = ?").bind("node-a").run();

    const report = await service.validate();

    expect(report.valid).toBe(0);
    expect(report.orphaned).toHaveLength(1);
    expect(report.orphaned[0].id).toBe("edge-orphan-src");
    expect(report.invalid).toHaveLength(0);
  });

  it("invalid edge detected — depends_on from project to node is not in matrix", async () => {
    await insertProject("proj-1", "My Project");
    await insertNode("node-a", "Node A");

    // Manually insert an invalid edge (depends_on project->node not allowed in matrix)
    await insertEdge("edge-invalid", "project", "proj-1", "node", "node-a", "depends_on");

    const report = await service.validate();

    expect(report.valid).toBe(0);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].id).toBe("edge-invalid");
    expect(report.orphaned).toHaveLength(0);
  });

  it("edges to archived projects are NOT reported as orphaned", async () => {
    await insertNode("node-a", "Node A");
    // Create project as archived
    await insertProject("proj-archived", "Archived Project", "archived");

    // Create valid edge: project->node relates_to (allowed in matrix)
    await insertEdge("edge-archived", "project", "proj-archived", "node", "node-a", "relates_to");

    const report = await service.validate();

    expect(report.valid).toBe(1);
    expect(report.orphaned).toHaveLength(0);
    expect(report.invalid).toHaveLength(0);
  });

  it("mixed scenario: valid, orphaned, and invalid edges all detected correctly", async () => {
    await insertNode("node-a", "Node A");
    await insertNode("node-b", "Node B");
    await insertNode("node-c", "Node C");
    await insertProject("proj-1", "My Project");

    // Valid edge: node->node relates_to
    await insertEdge("edge-valid", "node", "node-a", "node", "node-b", "relates_to");

    // Will become orphaned: target node-c exists now, we'll delete it
    await insertEdge("edge-will-orphan", "node", "node-a", "node", "node-c", "depends_on");
    await env.DB.prepare("DELETE FROM nodes WHERE id = ?").bind("node-c").run();

    // Invalid matrix violation: depends_on project->node not allowed
    await insertEdge("edge-matrix-invalid", "project", "proj-1", "node", "node-a", "depends_on");

    const report = await service.validate();

    expect(report.valid).toBe(1);
    expect(report.orphaned).toHaveLength(1);
    expect(report.orphaned[0].id).toBe("edge-will-orphan");
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].id).toBe("edge-matrix-invalid");
  });
});
