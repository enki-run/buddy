import { ulid } from "ulidx";
import type { Node, NodeType, NodeStatus, Context, PaginatedResult } from "../types";
import { LIMITS, NODE_TYPES, NODE_STATUSES, CONTEXTS } from "../types";
import type { ActivityService } from "./activity";

export class NodeService {
  constructor(
    private db: D1Database,
    private activity: ActivityService,
  ) {}

  // === Public Methods ===

  async save(params: {
    type: NodeType;
    title: string;
    content?: string;
    url?: string;
    tags?: string[];
    context?: Context;
    encryptionToken?: string;
  }): Promise<Node> {
    this.validateSaveParams(params);

    const id = ulid();
    const now = new Date().toISOString();
    const tagsJson = params.tags ? JSON.stringify(params.tags) : null;

    let content = params.content ?? null;
    let encrypted = 0;

    if (params.type === "secret" && content !== null) {
      if (!params.encryptionToken) {
        throw new Error("Encryption token required for secret nodes");
      }
      content = await this.encrypt(content, params.encryptionToken);
      encrypted = 1;
    }

    await this.db
      .prepare(
        `INSERT INTO nodes (id, type, title, content, url, tags, context, status, encrypted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .bind(id, params.type, params.title, content, params.url ?? null, tagsJson, params.context ?? null, encrypted, now, now)
      .run();

    await this.activity.log({
      action: "node_created",
      entity_type: "node",
      entity_id: id,
      summary: `Created ${params.type}: ${params.title}`,
    });

    return {
      id,
      type: params.type,
      title: params.title,
      content,
      url: params.url ?? null,
      tags: tagsJson,
      context: params.context ?? null,
      status: "active",
      encrypted,
      created_at: now,
      updated_at: now,
    };
  }

  async getById(
    id: string,
    decryptionTokens?: { current: string; previous?: string },
  ): Promise<Node | null> {
    const node = await this.db
      .prepare("SELECT * FROM nodes WHERE id = ?")
      .bind(id)
      .first<Node>();

    if (!node) return null;

    if (node.encrypted === 1) {
      if (!decryptionTokens) {
        return { ...node, content: "[encrypted]" };
      }

      try {
        node.content = await this.decrypt(node.content!, decryptionTokens.current);
      } catch {
        if (decryptionTokens.previous) {
          try {
            node.content = await this.decrypt(node.content!, decryptionTokens.previous);
          } catch {
            return { ...node, content: "[encrypted]" };
          }
        } else {
          return { ...node, content: "[encrypted]" };
        }
      }
    }

    return node;
  }

  async list(params: {
    type?: NodeType;
    context?: Context;
    tags?: string[];
    status?: NodeStatus;
    limit: number;
    offset: number;
  }): Promise<PaginatedResult<Node>> {
    const { limit, offset } = params;
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.type !== undefined) {
      conditions.push("n.type = ?");
      bindings.push(params.type);
    }
    if (params.context !== undefined) {
      conditions.push("n.context = ?");
      bindings.push(params.context);
    }
    if (params.status !== undefined) {
      conditions.push("n.status = ?");
      bindings.push(params.status);
    }
    if (params.tags && params.tags.length > 0) {
      // Each tag must match via json_each
      for (const tag of params.tags) {
        conditions.push("EXISTS (SELECT 1 FROM json_each(n.tags) WHERE json_each.value = ?)");
        bindings.push(tag);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [dataResult, countResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT n.* FROM nodes n ${whereClause} ORDER BY n.updated_at DESC LIMIT ? OFFSET ?`,
        )
        .bind(...bindings, limit, offset)
        .all<Node>(),
      this.db
        .prepare(`SELECT COUNT(*) as total FROM nodes n ${whereClause}`)
        .bind(...bindings)
        .first<{ total: number }>(),
    ]);

    const total = countResult?.total ?? 0;
    const data = dataResult.results.map((node) => {
      if (node.type === "secret") {
        return { ...node, content: null };
      }
      return node;
    });

    return {
      data,
      has_more: offset + data.length < total,
      total,
      limit,
      offset,
    };
  }

  async search(params: {
    query: string;
    type?: NodeType;
    context?: Context;
    limit: number;
    offset: number;
  }): Promise<PaginatedResult<Node>> {
    const { query, limit, offset } = params;
    const conditions: string[] = [];
    const bindings: unknown[] = [query];

    if (params.type !== undefined) {
      conditions.push("n.type = ?");
      bindings.push(params.type);
    }
    if (params.context !== undefined) {
      conditions.push("n.context = ?");
      bindings.push(params.context);
    }

    const extraWhere = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

    const [dataResult, countResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT n.* FROM nodes n
           JOIN nodes_fts f ON n.rowid = f.rowid
           WHERE nodes_fts MATCH ? ${extraWhere}
           ORDER BY rank
           LIMIT ? OFFSET ?`,
        )
        .bind(...bindings, limit, offset)
        .all<Node>(),
      this.db
        .prepare(
          `SELECT COUNT(*) as total FROM nodes n
           JOIN nodes_fts f ON n.rowid = f.rowid
           WHERE nodes_fts MATCH ? ${extraWhere}`,
        )
        .bind(...bindings)
        .first<{ total: number }>(),
    ]);

    const total = countResult?.total ?? 0;
    const data = dataResult.results.map((node) => {
      if (node.type === "secret") {
        return { ...node, content: null };
      }
      return node;
    });

    return {
      data,
      has_more: offset + data.length < total,
      total,
      limit,
      offset,
    };
  }

  async update(
    id: string,
    params: Partial<{
      type: NodeType;
      title: string;
      content: string;
      url: string;
      tags: string[];
      context: Context;
      status: NodeStatus;
      encryptionToken?: string;
    }>,
  ): Promise<Node | null> {
    const existing = await this.db
      .prepare("SELECT * FROM nodes WHERE id = ?")
      .bind(id)
      .first<Node>();

    if (!existing) return null;

    this.validateUpdateParams(params);

    const now = new Date().toISOString();
    const setClauses: string[] = ["updated_at = ?"];
    const bindings: unknown[] = [now];

    if (params.type !== undefined) {
      setClauses.push("type = ?");
      bindings.push(params.type);
    }
    if (params.title !== undefined) {
      setClauses.push("title = ?");
      bindings.push(params.title);
    }
    if (params.content !== undefined) {
      const nodeType = params.type ?? existing.type;
      if (nodeType === "secret") {
        if (!params.encryptionToken) {
          throw new Error("Encryption token required for secret nodes");
        }
        const encrypted = await this.encrypt(params.content, params.encryptionToken);
        setClauses.push("content = ?");
        bindings.push(encrypted);
        setClauses.push("encrypted = 1");
      } else {
        setClauses.push("content = ?");
        bindings.push(params.content);
      }
    }
    if (params.url !== undefined) {
      setClauses.push("url = ?");
      bindings.push(params.url);
    }
    if (params.tags !== undefined) {
      setClauses.push("tags = ?");
      bindings.push(JSON.stringify(params.tags));
    }
    if (params.context !== undefined) {
      setClauses.push("context = ?");
      bindings.push(params.context);
    }
    if (params.status !== undefined) {
      setClauses.push("status = ?");
      bindings.push(params.status);
    }

    bindings.push(id);

    await this.db
      .prepare(`UPDATE nodes SET ${setClauses.join(", ")} WHERE id = ?`)
      .bind(...bindings)
      .run();

    await this.activity.log({
      action: "node_updated",
      entity_type: "node",
      entity_id: id,
      summary: `Updated node: ${params.title ?? existing.title}`,
    });

    return this.db.prepare("SELECT * FROM nodes WHERE id = ?").bind(id).first<Node>();
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.db
      .prepare("SELECT id, title, type FROM nodes WHERE id = ?")
      .bind(id)
      .first<{ id: string; title: string; type: string }>();

    if (!existing) return false;

    await this.db.batch([
      this.db
        .prepare("DELETE FROM edges WHERE (from_type = 'node' AND from_id = ?) OR (to_type = 'node' AND to_id = ?)")
        .bind(id, id),
      this.db.prepare("DELETE FROM nodes WHERE id = ?").bind(id),
    ]);

    await this.activity.log({
      action: "node_deleted",
      entity_type: "node",
      entity_id: id,
      summary: `Deleted ${existing.type}: ${existing.title}`,
    });

    return true;
  }

  // === Validation ===

  private validateSaveParams(params: {
    type: NodeType;
    title: string;
    content?: string;
    url?: string;
    tags?: string[];
    context?: Context;
  }): void {
    if (!NODE_TYPES.includes(params.type)) {
      throw new Error(`Invalid node type: ${params.type}`);
    }
    if (params.title.length > LIMITS.TITLE_MAX) {
      throw new Error(`Title exceeds maximum length of ${LIMITS.TITLE_MAX} characters`);
    }
    if (params.content && params.content.length > LIMITS.CONTENT_MAX) {
      throw new Error(`Content exceeds maximum length of ${LIMITS.CONTENT_MAX} characters`);
    }
    if (params.tags) {
      if (params.tags.length > LIMITS.TAGS_MAX_COUNT) {
        throw new Error(`Tags exceed maximum count of ${LIMITS.TAGS_MAX_COUNT}`);
      }
      for (const tag of params.tags) {
        if (tag.length > LIMITS.TAG_MAX_LENGTH) {
          throw new Error(`Tag "${tag}" exceeds maximum length of ${LIMITS.TAG_MAX_LENGTH} characters`);
        }
      }
    }
    if (params.context && !CONTEXTS.includes(params.context)) {
      throw new Error(`Invalid context: ${params.context}`);
    }
  }

  private validateUpdateParams(params: Partial<{
    type: NodeType;
    title: string;
    content: string;
    url: string;
    tags: string[];
    context: Context;
    status: NodeStatus;
  }>): void {
    if (params.type !== undefined && !NODE_TYPES.includes(params.type)) {
      throw new Error(`Invalid node type: ${params.type}`);
    }
    if (params.title !== undefined && params.title.length > LIMITS.TITLE_MAX) {
      throw new Error(`Title exceeds maximum length of ${LIMITS.TITLE_MAX} characters`);
    }
    if (params.content !== undefined && params.content.length > LIMITS.CONTENT_MAX) {
      throw new Error(`Content exceeds maximum length of ${LIMITS.CONTENT_MAX} characters`);
    }
    if (params.tags) {
      if (params.tags.length > LIMITS.TAGS_MAX_COUNT) {
        throw new Error(`Tags exceed maximum count of ${LIMITS.TAGS_MAX_COUNT}`);
      }
      for (const tag of params.tags) {
        if (tag.length > LIMITS.TAG_MAX_LENGTH) {
          throw new Error(`Tag "${tag}" exceeds maximum length of ${LIMITS.TAG_MAX_LENGTH} characters`);
        }
      }
    }
    if (params.context !== undefined && !CONTEXTS.includes(params.context)) {
      throw new Error(`Invalid context: ${params.context}`);
    }
    if (params.status !== undefined && !NODE_STATUSES.includes(params.status)) {
      throw new Error(`Invalid status: ${params.status}`);
    }
  }

  // === Encryption ===

  private async deriveKey(token: string): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(token),
      "HKDF",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),
        info: new TextEncoder().encode("buddy-encryption"),
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  private async encrypt(plaintext: string, token: string): Promise<string> {
    const key = await this.deriveKey(token);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  private async decrypt(encoded: string, token: string): Promise<string> {
    const key = await this.deriveKey(token);
    const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  }
}
