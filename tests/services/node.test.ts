import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { NodeService } from "../../src/services/node";
import { ActivityService } from "../../src/services/activity";

const TEST_TOKEN = "test-encryption-token-32chars!!";
const TEST_TOKEN_PREVIOUS = "old-encryption-token-32chars-!!";

describe("NodeService", () => {
  let service: NodeService;
  let activityService: ActivityService;

  beforeEach(async () => {
    activityService = new ActivityService(env.DB);
    service = new NodeService(env.DB, activityService);
    // Clean up in FK-safe order
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM edges").run();
    await env.DB.prepare("DELETE FROM nodes").run();
  });

  // === save() ===

  it("save() creates a node and returns it with correct fields", async () => {
    const node = await service.save({
      type: "concept",
      title: "Test Concept",
      content: "Some content here",
      context: "dev",
    });

    expect(node.id).toBeDefined();
    expect(node.type).toBe("concept");
    expect(node.title).toBe("Test Concept");
    expect(node.content).toBe("Some content here");
    expect(node.context).toBe("dev");
    expect(node.status).toBe("active");
    expect(node.encrypted).toBe(0);
    expect(node.created_at).toBeDefined();
    expect(node.updated_at).toBeDefined();

    // Verify persisted in DB
    const row = await env.DB.prepare("SELECT * FROM nodes WHERE id = ?")
      .bind(node.id)
      .first();
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).title).toBe("Test Concept");
  });

  it("save() with tags stores them as JSON string", async () => {
    const node = await service.save({
      type: "fact",
      title: "Tagged Fact",
      tags: ["docker", "linux", "arm"],
    });

    expect(node.tags).toBe(JSON.stringify(["docker", "linux", "arm"]));

    // Verify DB storage
    const row = await env.DB.prepare("SELECT tags FROM nodes WHERE id = ?")
      .bind(node.id)
      .first<{ tags: string }>();
    expect(row?.tags).toBe(JSON.stringify(["docker", "linux", "arm"]));
  });

  it("save() rejects title > 500 chars", async () => {
    const longTitle = "x".repeat(501);
    await expect(
      service.save({ type: "concept", title: longTitle }),
    ).rejects.toThrow("Title exceeds maximum length of 500 characters");
  });

  it("save() rejects content > 100KB", async () => {
    const longContent = "x".repeat(102_401);
    await expect(
      service.save({ type: "concept", title: "Valid", content: longContent }),
    ).rejects.toThrow("Content exceeds maximum length");
  });

  it("save() rejects more than 20 tags", async () => {
    const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    await expect(
      service.save({ type: "concept", title: "Valid", tags: tooManyTags }),
    ).rejects.toThrow("Tags exceed maximum count of 20");
  });

  it("save() rejects tag longer than 50 chars", async () => {
    const longTag = "x".repeat(51);
    await expect(
      service.save({ type: "concept", title: "Valid", tags: [longTag] }),
    ).rejects.toThrow("exceeds maximum length of 50 characters");
  });

  it("save() with url stores it and returns it", async () => {
    const node = await service.save({
      type: "config",
      title: "Product Page",
      url: "https://buddy.enki.run/",
      context: "dev",
    });

    expect(node.url).toBe("https://buddy.enki.run/");

    const row = await env.DB.prepare("SELECT url FROM nodes WHERE id = ?")
      .bind(node.id)
      .first<{ url: string }>();
    expect(row?.url).toBe("https://buddy.enki.run/");
  });

  it("save() without url defaults to null", async () => {
    const node = await service.save({
      type: "concept",
      title: "No URL",
    });

    expect(node.url).toBeNull();
  });

  it("update() can set and change url", async () => {
    const node = await service.save({
      type: "config",
      title: "Docs Link",
    });
    expect(node.url).toBeNull();

    const updated = await service.update(node.id, {
      url: "https://docs.example.com",
    });
    expect(updated!.url).toBe("https://docs.example.com");

    const changed = await service.update(node.id, {
      url: "https://docs.example.com/v2",
    });
    expect(changed!.url).toBe("https://docs.example.com/v2");
  });

  it("save() logs activity with action node_created", async () => {
    const node = await service.save({
      type: "concept",
      title: "Activity Test",
    });

    const activity = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE entity_id = ? AND action = 'node_created'",
    )
      .bind(node.id)
      .first();
    expect(activity).not.toBeNull();
  });

  // === getById() ===

  it("getById() returns node by ID", async () => {
    const created = await service.save({
      type: "concept",
      title: "Fetch Me",
      content: "Body text",
      context: "dev",
    });

    const fetched = await service.getById(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.title).toBe("Fetch Me");
    expect(fetched!.content).toBe("Body text");
    expect(fetched!.context).toBe("dev");
  });

  it("getById() returns null for non-existent ID", async () => {
    const result = await service.getById("nonexistent-id");
    expect(result).toBeNull();
  });

  // === list() ===

  it("list() with type filter returns only matching nodes", async () => {
    await service.save({ type: "concept", title: "Concept 1" });
    await service.save({ type: "fact", title: "Fact 1" });
    await service.save({ type: "concept", title: "Concept 2" });

    const result = await service.list({ type: "concept", limit: 10, offset: 0 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.data.every((n) => n.type === "concept")).toBe(true);
  });

  it("list() returns paginated results with correct has_more and total", async () => {
    for (let i = 0; i < 5; i++) {
      await service.save({ type: "concept", title: `Node ${i}` });
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

  it("list() with tags filter via json_each returns matching nodes", async () => {
    await service.save({ type: "concept", title: "Docker Node", tags: ["docker", "devops"] });
    await service.save({ type: "concept", title: "Python Node", tags: ["python", "backend"] });
    await service.save({ type: "concept", title: "Both Node", tags: ["docker", "python"] });

    const result = await service.list({ tags: ["docker"], limit: 10, offset: 0 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    const titles = result.data.map((n) => n.title);
    expect(titles).toContain("Docker Node");
    expect(titles).toContain("Both Node");
  });

  it("list() with context filter returns only matching nodes", async () => {
    await service.save({ type: "concept", title: "Dev Node", context: "dev" });
    await service.save({ type: "concept", title: "Musik Node", context: "musik" });

    const result = await service.list({ context: "dev", limit: 10, offset: 0 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe("Dev Node");
  });

  it("list() orders by updated_at DESC", async () => {
    const n1 = await service.save({ type: "concept", title: "First" });
    const n2 = await service.save({ type: "concept", title: "Second" });
    const n3 = await service.save({ type: "concept", title: "Third" });

    const result = await service.list({ limit: 10, offset: 0 });

    // Last created should be first (most recent updated_at)
    expect(result.data[0].title).toBe("Third");
    expect(result.data[2].title).toBe("First");
  });

  it("list() never returns content for secret nodes", async () => {
    await service.save({
      type: "secret",
      title: "API Key",
      content: "sk-12345",
      encryptionToken: TEST_TOKEN,
    });
    await service.save({ type: "concept", title: "Normal", content: "visible" });

    const result = await service.list({ limit: 10, offset: 0 });

    const secret = result.data.find((n) => n.type === "secret");
    const normal = result.data.find((n) => n.type === "concept");
    expect(secret?.content).toBeNull();
    expect(normal?.content).toBe("visible");
  });

  // === search() ===

  it("search() finds nodes by FTS5 query", async () => {
    await service.save({ type: "concept", title: "Kubernetes Overview", content: "Container orchestration platform" });
    await service.save({ type: "fact", title: "Docker Basics", content: "Container runtime engine" });
    await service.save({ type: "concept", title: "Python Tips", content: "Programming language tricks" });

    const result = await service.search({ query: "container", limit: 10, offset: 0 });

    expect(result.data.length).toBeGreaterThanOrEqual(2);
    const titles = result.data.map((n) => n.title);
    expect(titles).toContain("Kubernetes Overview");
    expect(titles).toContain("Docker Basics");
  });

  it("search() with type filter returns only matching types", async () => {
    await service.save({ type: "concept", title: "Kubernetes Overview", content: "Container orchestration" });
    await service.save({ type: "fact", title: "Docker Basics", content: "Container runtime" });

    const result = await service.search({ query: "container", type: "concept", limit: 10, offset: 0 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe("concept");
  });

  it("search() never returns content for secret nodes", async () => {
    await service.save({
      type: "secret",
      title: "Secret Token",
      content: "my-secret-value",
      encryptionToken: TEST_TOKEN,
    });

    // Search by title
    const result = await service.search({ query: "Secret Token", limit: 10, offset: 0 });

    if (result.data.length > 0) {
      const secret = result.data.find((n) => n.type === "secret");
      if (secret) {
        expect(secret.content).toBeNull();
      }
    }
  });

  it("search() returns paginated results with total", async () => {
    for (let i = 0; i < 5; i++) {
      await service.save({ type: "concept", title: `Searchable Item ${i}`, content: "findable content" });
    }

    const result = await service.search({ query: "findable", limit: 2, offset: 0 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.has_more).toBe(true);
  });

  // === update() ===

  it("update() modifies fields and updates updated_at", async () => {
    const node = await service.save({
      type: "concept",
      title: "Original Title",
      content: "Original content",
    });

    // Small delay to ensure updated_at differs
    await new Promise((r) => setTimeout(r, 10));

    const updated = await service.update(node.id, {
      title: "Updated Title",
      content: "Updated content",
    });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Updated Title");
    expect(updated!.content).toBe("Updated content");
    expect(updated!.updated_at).not.toBe(node.updated_at);
  });

  it("update() returns null for non-existent ID", async () => {
    const result = await service.update("nonexistent-id", { title: "Nope" });
    expect(result).toBeNull();
  });

  it("update() partial update only changes provided fields", async () => {
    const node = await service.save({
      type: "concept",
      title: "Keep Title",
      content: "Keep Content",
      context: "dev",
    });

    const updated = await service.update(node.id, { status: "deprecated" });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Keep Title");
    expect(updated!.content).toBe("Keep Content");
    expect(updated!.context).toBe("dev");
    expect(updated!.status).toBe("deprecated");
  });

  it("update() logs activity with action node_updated", async () => {
    const node = await service.save({ type: "concept", title: "Update Me" });
    await service.update(node.id, { title: "Updated" });

    const activity = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE entity_id = ? AND action = 'node_updated'",
    )
      .bind(node.id)
      .first();
    expect(activity).not.toBeNull();
  });

  // === delete() ===

  it("delete() removes the node", async () => {
    const node = await service.save({ type: "concept", title: "Delete Me" });

    const result = await service.delete(node.id);

    expect(result).toBe(true);

    const row = await env.DB.prepare("SELECT * FROM nodes WHERE id = ?")
      .bind(node.id)
      .first();
    expect(row).toBeNull();
  });

  it("delete() returns false for non-existent ID", async () => {
    const result = await service.delete("nonexistent-id");
    expect(result).toBe(false);
  });

  it("delete() also removes edges referencing the node", async () => {
    const node1 = await service.save({ type: "concept", title: "Node A" });
    const node2 = await service.save({ type: "concept", title: "Node B" });

    // Create edges referencing node1
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO edges (id, from_type, from_id, to_type, to_id, relation, created_at)
       VALUES (?, 'node', ?, 'node', ?, 'relates_to', ?)`,
    )
      .bind("edge-1", node1.id, node2.id, now)
      .run();
    await env.DB.prepare(
      `INSERT INTO edges (id, from_type, from_id, to_type, to_id, relation, created_at)
       VALUES (?, 'node', ?, 'node', ?, 'depends_on', ?)`,
    )
      .bind("edge-2", node2.id, node1.id, now)
      .run();

    // Delete node1
    await service.delete(node1.id);

    // Both edges should be gone
    const edge1 = await env.DB.prepare("SELECT * FROM edges WHERE id = 'edge-1'").first();
    const edge2 = await env.DB.prepare("SELECT * FROM edges WHERE id = 'edge-2'").first();
    expect(edge1).toBeNull();
    expect(edge2).toBeNull();

    // node2 should still exist
    const remaining = await service.getById(node2.id);
    expect(remaining).not.toBeNull();
  });

  it("delete() logs activity with action node_deleted", async () => {
    const node = await service.save({ type: "concept", title: "Delete Activity" });
    await service.delete(node.id);

    const activity = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE entity_id = ? AND action = 'node_deleted'",
    )
      .bind(node.id)
      .first();
    expect(activity).not.toBeNull();
  });

  // === Encryption ===

  it("save() with type 'secret' encrypts content", async () => {
    const node = await service.save({
      type: "secret",
      title: "My Secret",
      content: "super-secret-value",
      encryptionToken: TEST_TOKEN,
    });

    expect(node.encrypted).toBe(1);
    // The returned content should be the encrypted base64 string, not plaintext
    expect(node.content).not.toBe("super-secret-value");
    expect(node.content).toBeTruthy();

    // Verify DB storage is encrypted
    const row = await env.DB.prepare("SELECT content FROM nodes WHERE id = ?")
      .bind(node.id)
      .first<{ content: string }>();
    expect(row?.content).not.toBe("super-secret-value");
  });

  it("getById() with decryption tokens decrypts secret nodes", async () => {
    const node = await service.save({
      type: "secret",
      title: "Decrypt Me",
      content: "the-actual-secret",
      encryptionToken: TEST_TOKEN,
    });

    const fetched = await service.getById(node.id, { current: TEST_TOKEN });

    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe("the-actual-secret");
  });

  it("getById() without tokens returns '[encrypted]' for secret nodes", async () => {
    const node = await service.save({
      type: "secret",
      title: "No Token",
      content: "hidden-value",
      encryptionToken: TEST_TOKEN,
    });

    const fetched = await service.getById(node.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe("[encrypted]");
  });

  it("getById() falls back to previous token for key rotation", async () => {
    // Encrypt with old token
    const node = await service.save({
      type: "secret",
      title: "Rotated Secret",
      content: "rotation-test-value",
      encryptionToken: TEST_TOKEN_PREVIOUS,
    });

    // Decrypt with current (wrong) + previous (correct)
    const fetched = await service.getById(node.id, {
      current: TEST_TOKEN,
      previous: TEST_TOKEN_PREVIOUS,
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe("rotation-test-value");
  });

  it("getById() returns '[encrypted]' when both tokens fail", async () => {
    const node = await service.save({
      type: "secret",
      title: "Wrong Tokens",
      content: "unreachable",
      encryptionToken: TEST_TOKEN,
    });

    const fetched = await service.getById(node.id, {
      current: "wrong-token-aaaaaaaaaaaaa",
      previous: "also-wrong-token-aaaaaaaaaa",
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe("[encrypted]");
  });

  it("save() secret without encryption token throws error", async () => {
    await expect(
      service.save({
        type: "secret",
        title: "Missing Token",
        content: "needs-encryption",
      }),
    ).rejects.toThrow("Encryption token required for secret nodes");
  });

  it("update() re-encrypts content for secret nodes", async () => {
    const node = await service.save({
      type: "secret",
      title: "Update Secret",
      content: "original-secret",
      encryptionToken: TEST_TOKEN,
    });

    await service.update(node.id, {
      content: "updated-secret",
      encryptionToken: TEST_TOKEN,
    });

    const fetched = await service.getById(node.id, { current: TEST_TOKEN });
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe("updated-secret");

    // Verify DB is encrypted, not plaintext
    const row = await env.DB.prepare("SELECT content FROM nodes WHERE id = ?")
      .bind(node.id)
      .first<{ content: string }>();
    expect(row?.content).not.toBe("updated-secret");
  });
});
