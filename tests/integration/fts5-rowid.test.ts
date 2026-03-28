import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";

const NOW = new Date().toISOString();

// Helper: insert a node directly via SQL and return rowid
async function insertNode(id: string, title: string, content: string | null = null) {
  await env.DB.prepare(
    `INSERT INTO nodes (id, type, title, content, tags, context, status, encrypted, created_at, updated_at)
     VALUES (?, 'concept', ?, ?, NULL, NULL, 'active', 0, ?, ?)`,
  )
    .bind(id, title, content, NOW, NOW)
    .run();

  const row = await env.DB.prepare("SELECT rowid FROM nodes WHERE id = ?")
    .bind(id)
    .first<{ rowid: number }>();
  return row!.rowid;
}

// Helper: FTS5 search, returns matching node IDs
async function ftsSearch(query: string): Promise<string[]> {
  const result = await env.DB.prepare(
    `SELECT n.id FROM nodes n
     JOIN nodes_fts f ON n.rowid = f.rowid
     WHERE nodes_fts MATCH ?
     ORDER BY rank`,
  )
    .bind(query)
    .all<{ id: string }>();
  return result.results.map((r) => r.id);
}

describe("FTS5 + TEXT PK Integration", () => {
  beforeEach(async () => {
    // Clean up in FK-safe order
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM edges").run();
    await env.DB.prepare("DELETE FROM nodes").run();
    // nodes_fts is a content table backed by nodes — triggers keep it in sync.
    // After deleting all nodes, the FTS index should be empty via the nodes_ad trigger.
  });

  it("FTS5 finds an inserted node by title", async () => {
    await insertNode("node-fts-01", "Kubernetes Cluster", "Container orchestration system");

    const ids = await ftsSearch("Kubernetes");

    expect(ids).toContain("node-fts-01");
  });

  it("FTS5 reflects title updates (old term disappears, new term appears)", async () => {
    await insertNode("node-fts-02", "Alpha Service", "Service description");

    // Confirm initial term is findable
    const beforeIds = await ftsSearch("Alpha");
    expect(beforeIds).toContain("node-fts-02");

    // Update title via SQL — the nodes_au trigger keeps FTS in sync
    const newNow = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE nodes SET title = 'Beta Service', updated_at = ? WHERE id = ?`,
    )
      .bind(newNow, "node-fts-02")
      .run();

    // Old term should no longer match
    const afterOldIds = await ftsSearch("Alpha");
    expect(afterOldIds).not.toContain("node-fts-02");

    // New term should match
    const afterNewIds = await ftsSearch("Beta");
    expect(afterNewIds).toContain("node-fts-02");
  });

  it("FTS5 removes deleted nodes from the index", async () => {
    await insertNode("node-fts-03", "Ephemeral Node", "This will be deleted");

    // Confirm initially findable
    const before = await ftsSearch("Ephemeral");
    expect(before).toContain("node-fts-03");

    // Delete the node — nodes_ad trigger removes it from FTS
    await env.DB.prepare("DELETE FROM nodes WHERE id = ?")
      .bind("node-fts-03")
      .run();

    // Should no longer appear in FTS results
    const after = await ftsSearch("Ephemeral");
    expect(after).not.toContain("node-fts-03");
  });

  it("FTS5 searches content field", async () => {
    await insertNode("node-fts-04", "Generic Title", "NATS messaging broker configuration");

    // Search by content keyword — not present in title
    const ids = await ftsSearch("messaging");

    expect(ids).toContain("node-fts-04");
  });

  it("FTS5 handles multiple nodes and returns correct matches", async () => {
    await insertNode("node-fts-05", "Redis Cache", "In-memory key-value store");
    await insertNode("node-fts-06", "PostgreSQL DB", "Relational database");
    await insertNode("node-fts-07", "Redis Sentinel", "High availability for Redis");

    const redisIds = await ftsSearch("Redis");
    expect(redisIds).toContain("node-fts-05");
    expect(redisIds).toContain("node-fts-07");
    expect(redisIds).not.toContain("node-fts-06");

    const dbIds = await ftsSearch("database");
    expect(dbIds).toContain("node-fts-06");
    expect(dbIds).not.toContain("node-fts-05");
  });

  it("FTS5 JOIN ON n.rowid = f.rowid works with TEXT primary key", async () => {
    // This test explicitly verifies the rowid-based join works when the PK is TEXT (ULID),
    // not INTEGER — a potential D1 gotcha where rowid != id.
    const rowid = await insertNode("node-fts-08", "Rowid Test Node", "Verifying rowid join");

    // Directly check the FTS index has an entry with the correct rowid
    const ftsRow = await env.DB.prepare(
      `SELECT rowid FROM nodes_fts WHERE nodes_fts MATCH 'Rowid'`,
    ).first<{ rowid: number }>();

    expect(ftsRow).not.toBeNull();
    expect(ftsRow!.rowid).toBe(rowid);

    // And the join produces the correct node id
    const ids = await ftsSearch("Rowid");
    expect(ids).toContain("node-fts-08");
  });
});
