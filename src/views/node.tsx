import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { Layout } from "./layout";
import type { Node, Edge } from "../types";
import { renderMarkdown, escapeHtml } from "../markdown";

interface NodeDetailProps {
  node: Node;
  incoming: Array<{ edge: Edge; entity: any }>;
  outgoing: Array<{ edge: Edge; entity: any }>;
}

/** Parse JSON tags, return array */
function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // ignore
  }
  return [];
}

/** Format ISO date nicely */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Get label for entity type + id combination */
function entityLabel(entity: any, entityType: string): string {
  if (!entity) return `[${entityType}]`;
  if (entity.title) return entity.title;
  if (entity.name) return entity.name;
  return `[${entityType}]`;
}

/** Get URL for entity */
function entityUrl(entityType: string, entityId: string): string {
  switch (entityType) {
    case "node": return `/nodes/${entityId}`;
    case "project": return `/project/${entityId}`;
    default: return "#";
  }
}

export const NodeDetailPage: FC<NodeDetailProps> = ({ node, incoming, outgoing }) => {
  const tags = parseTags(node.tags);

  return (
    <Layout title={node.title} activePath="/nodes">
      {/* Breadcrumb */}
      <div class="breadcrumb">
        <a href="/nodes">Nodes</a>
        <span style="margin: 0 6px; color: var(--color-ghost);">/</span>
        <span>{escapeHtml(node.title)}</span>
      </div>

      {/* Node header */}
      <div class="node-detail-header">
        <div class="node-detail-badges">
          <span class={`badge badge-${escapeHtml(node.type)}`}>{escapeHtml(node.type)}</span>
          {node.context && (
            <span class={`badge badge-${escapeHtml(node.context)}`}>{escapeHtml(node.context)}</span>
          )}
          <span class={`badge badge-${escapeHtml(node.status)}`}>{escapeHtml(node.status)}</span>
          {node.encrypted === 1 && (
            <span class="badge" style="background: #f5e4e4; color: #7a2a2a;">verschlüsselt</span>
          )}
        </div>
        <h1 class="node-detail-title">{escapeHtml(node.title)}</h1>
        <div style="font-family: var(--font-mono); font-size: 0.69rem; color: var(--color-light);">
          Erstellt: {fmtDate(node.created_at)} · Aktualisiert: {fmtDate(node.updated_at)}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 1.23rem;">
          {tags.map((tag) => (
            <a href={`/nodes?tag=${encodeURIComponent(tag)}`} class="tag" style="text-decoration: none;">
              {escapeHtml(tag)}
            </a>
          ))}
        </div>
      )}

      {/* Content */}
      {node.content ? (
        node.encrypted === 1 ? (
          <div style="padding: 1.23rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.46rem; color: var(--color-subtle); font-family: var(--font-mono); font-size: 0.85rem;">
            [Inhalt ist verschlüsselt]
          </div>
        ) : (
          <div class="markdown-content">
            {raw(renderMarkdown(node.content))}
          </div>
        )
      ) : (
        <p class="empty" style="margin-top: 1.23rem;">Kein Inhalt vorhanden.</p>
      )}

      {/* Connections */}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <div class="connections-section">
          <h2>Verbindungen</h2>

          {outgoing.length > 0 && (
            <div style="margin-bottom: 1.23rem;">
              <div style="font-size: 0.77rem; font-weight: 600; color: var(--color-subtle); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.46rem;">
                Ausgehend ({outgoing.length})
              </div>
              {outgoing.map(({ edge, entity }) => (
                <div class="connection-item">
                  <span class="connection-relation">{escapeHtml(edge.relation)}</span>
                  <a href={entityUrl(edge.to_type, edge.to_id)} style="color: var(--color-body); flex: 1;">
                    {escapeHtml(entityLabel(entity, edge.to_type))}
                  </a>
                  <span style="font-size: 0.69rem; color: var(--color-ghost); font-family: var(--font-mono);">{escapeHtml(edge.to_type)}</span>
                  {edge.note && (
                    <span style="font-size: 0.77rem; color: var(--color-subtle); font-style: italic;">{escapeHtml(edge.note)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {incoming.length > 0 && (
            <div>
              <div style="font-size: 0.77rem; font-weight: 600; color: var(--color-subtle); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.46rem;">
                Eingehend ({incoming.length})
              </div>
              {incoming.map(({ edge, entity }) => (
                <div class="connection-item">
                  <span class="connection-relation">{escapeHtml(edge.relation)}</span>
                  <a href={entityUrl(edge.from_type, edge.from_id)} style="color: var(--color-body); flex: 1;">
                    {escapeHtml(entityLabel(entity, edge.from_type))}
                  </a>
                  <span style="font-size: 0.69rem; color: var(--color-ghost); font-family: var(--font-mono);">{escapeHtml(edge.from_type)}</span>
                  {edge.note && (
                    <span style="font-size: 0.77rem; color: var(--color-subtle); font-style: italic;">{escapeHtml(edge.note)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};
