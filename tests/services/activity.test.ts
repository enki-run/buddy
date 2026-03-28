import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { ActivityService } from "../../src/services/activity";

describe("ActivityService", () => {
  let service: ActivityService;

  beforeEach(async () => {
    service = new ActivityService(env.DB);
    // Clean up in FK-safe order (activity_log references projects)
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM projects").run();
  });

  it("log() creates an activity entry and returns it", async () => {
    const activity = await service.log({
      action: "create",
      entity_type: "node",
      entity_id: "node-123",
      summary: "Created a new node",
    });

    expect(activity.id).toBeDefined();
    expect(activity.action).toBe("create");
    expect(activity.entity_type).toBe("node");
    expect(activity.entity_id).toBe("node-123");
    expect(activity.summary).toBe("Created a new node");
    expect(activity.project_id).toBeNull();
    expect(activity.ip_hash).toBeNull();
    expect(activity.created_at).toBeDefined();

    // Verify it was persisted to DB
    const row = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE id = ?"
    )
      .bind(activity.id)
      .first();
    expect(row).not.toBeNull();
  });

  it("list() returns paginated results ordered by created_at DESC", async () => {
    // Insert three activities with slight time difference
    await service.log({ action: "create", entity_type: "node", entity_id: "n1" });
    await service.log({ action: "update", entity_type: "node", entity_id: "n2" });
    await service.log({ action: "delete", entity_type: "node", entity_id: "n3" });

    const result = await service.list({ limit: 10, offset: 0 });

    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(0);

    // Should be DESC by created_at — last inserted first
    // (ULID-based IDs are monotonically increasing so we check action order)
    const actions = result.data.map((a) => a.action);
    // The last logged item should appear first
    expect(actions[0]).toBe("delete");
    expect(actions[2]).toBe("create");
  });

  it("list() with project_id filter returns only matching entries", async () => {
    // Create projects first to satisfy FK constraint
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    )
      .bind("proj-A", "Project A", "active", now, now)
      .run();
    await env.DB.prepare(
      `INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    )
      .bind("proj-B", "Project B", "active", now, now)
      .run();

    await service.log({
      action: "create",
      entity_type: "task",
      entity_id: "t1",
      project_id: "proj-A",
    });
    await service.log({
      action: "update",
      entity_type: "task",
      entity_id: "t2",
      project_id: "proj-B",
    });
    await service.log({
      action: "delete",
      entity_type: "task",
      entity_id: "t3",
      project_id: "proj-A",
    });

    const result = await service.list({ project_id: "proj-A", limit: 10, offset: 0 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.data.every((a) => a.project_id === "proj-A")).toBe(true);
  });

  it("list() returns correct has_more and total", async () => {
    for (let i = 0; i < 5; i++) {
      await service.log({
        action: "create",
        entity_type: "node",
        entity_id: `n${i}`,
      });
    }

    // First page: limit 2
    const page1 = await service.list({ limit: 2, offset: 0 });
    expect(page1.total).toBe(5);
    expect(page1.data).toHaveLength(2);
    expect(page1.has_more).toBe(true);

    // Last page: limit 2, offset 4
    const page3 = await service.list({ limit: 2, offset: 4 });
    expect(page3.data).toHaveLength(1);
    expect(page3.has_more).toBe(false);

    // Beyond data
    const empty = await service.list({ limit: 2, offset: 10 });
    expect(empty.data).toHaveLength(0);
    expect(empty.has_more).toBe(false);
    expect(empty.total).toBe(5);
  });

  it("rotate() deletes old entries and returns count", async () => {
    // Insert entries with an artificially old created_at
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO activity_log (id, project_id, action, entity_type, entity_id, summary, ip_hash, created_at)
       VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?)`
    )
      .bind("old-1", "create", "node", "n-old-1", oldDate)
      .run();
    await env.DB.prepare(
      `INSERT INTO activity_log (id, project_id, action, entity_type, entity_id, summary, ip_hash, created_at)
       VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?)`
    )
      .bind("old-2", "update", "node", "n-old-2", oldDate)
      .run();
    await env.DB.prepare(
      `INSERT INTO activity_log (id, project_id, action, entity_type, entity_id, summary, ip_hash, created_at)
       VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?)`
    )
      .bind("recent-1", "delete", "node", "n-recent-1", recentDate)
      .run();

    const deleted = await service.rotate(30);

    expect(deleted).toBe(2);

    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM activity_log"
    ).first<{ count: number }>();
    expect(remaining?.count).toBe(1);
  });
});
