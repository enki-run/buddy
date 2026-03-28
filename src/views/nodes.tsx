import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { Node, PaginatedResult, NodeType, NodeStatus, Context } from "../types";
import { NODE_TYPES, NODE_STATUSES, CONTEXTS } from "../types";
import { escapeHtml } from "../markdown";

interface NodesFilters {
  type?: NodeType;
  context?: Context;
  status?: NodeStatus;
  offset: number;
}

interface NodesProps {
  result: PaginatedResult<Node>;
  filters: NodesFilters;
}

/** Parse JSON tags field, return array (empty if invalid/null) */
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

/** Format ISO date to short relative display */
function fmtUpdated(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "heute";
  if (diffDays === 1) return "gestern";
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Build URL with current filters + overrides */
function buildUrl(filters: NodesFilters, overrides: Partial<NodesFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.type) params.set("type", merged.type);
  if (merged.context) params.set("context", merged.context);
  if (merged.status) params.set("status", merged.status);
  if (merged.offset > 0) params.set("offset", String(merged.offset));
  const qs = params.toString();
  return qs ? `/nodes?${qs}` : "/nodes";
}

export const NodesPage: FC<NodesProps> = ({ result, filters }) => {
  const { data, total, has_more, limit, offset } = result;
  const pageCount = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <Layout title="Nodes" activePath="/nodes">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.23rem; flex-wrap: wrap;">
        <h1 style="font-size: 1.38rem;">Node Browser</h1>
        <span style="font-family: var(--font-mono); font-size: 0.77rem; color: var(--color-subtle);">{total} total</span>
      </div>

      {/* Filter bar */}
      <div class="filter-bar">
        <label style="font-size: 0.77rem; color: var(--color-subtle); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Typ:</label>
        <select
          onchange={`window.location.href='/nodes?' + new URLSearchParams({...Object.fromEntries(new URLSearchParams(window.location.search)), type: this.value || '', offset: '0'}).toString().replace(/[^&]*=[&$]/g, '')`}
          aria-label="Typ filter"
        >
          <option value="" selected={!filters.type}>Alle Typen</option>
          {NODE_TYPES.map((t) => (
            <option value={t} selected={filters.type === t}>{t}</option>
          ))}
        </select>

        <label style="font-size: 0.77rem; color: var(--color-subtle); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Kontext:</label>
        <select
          onchange={`window.location.href='/nodes?' + new URLSearchParams({...Object.fromEntries(new URLSearchParams(window.location.search)), context: this.value || '', offset: '0'}).toString().replace(/[^&]*=[&$]/g, '')`}
          aria-label="Kontext filter"
        >
          <option value="" selected={!filters.context}>Alle</option>
          {CONTEXTS.map((ctx) => (
            <option value={ctx} selected={filters.context === ctx}>{ctx}</option>
          ))}
        </select>

        <label style="font-size: 0.77rem; color: var(--color-subtle); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Status:</label>
        <select
          onchange={`window.location.href='/nodes?' + new URLSearchParams({...Object.fromEntries(new URLSearchParams(window.location.search)), status: this.value || '', offset: '0'}).toString().replace(/[^&]*=[&$]/g, '')`}
          aria-label="Status filter"
        >
          <option value="" selected={!filters.status}>Alle Status</option>
          {NODE_STATUSES.map((s) => (
            <option value={s} selected={filters.status === s}>{s}</option>
          ))}
        </select>

        {(filters.type || filters.context || filters.status) && (
          <a href="/nodes" style="font-size: 0.77rem; color: var(--color-subtle); padding: 0.31rem 0.62rem; border: 1px solid var(--color-border); border-radius: 0.46rem;">
            Filter löschen
          </a>
        )}
      </div>

      {/* Node cards */}
      {data.length === 0 ? (
        <p class="empty">Keine Nodes gefunden.</p>
      ) : (
        data.map((node) => {
          const tags = parseTags(node.tags);
          return (
            <a href={`/nodes/${escapeHtml(node.id)}`} class="node-card">
              <div class="node-card-header">
                <span class={`badge badge-${escapeHtml(node.type)}`}>{escapeHtml(node.type)}</span>
                {node.status !== "active" && (
                  <span class={`badge badge-${escapeHtml(node.status)}`}>{escapeHtml(node.status)}</span>
                )}
                {node.context && (
                  <span class={`badge badge-${escapeHtml(node.context)}`}>{escapeHtml(node.context)}</span>
                )}
                <span class="node-card-title">{escapeHtml(node.title)}</span>
                <span class="node-card-meta">{fmtUpdated(node.updated_at)}</span>
              </div>
              {tags.length > 0 && (
                <div class="node-card-tags">
                  {tags.map((tag) => (
                    <span class="tag">{escapeHtml(tag)}</span>
                  ))}
                </div>
              )}
            </a>
          );
        })
      )}

      {/* Pagination */}
      {(offset > 0 || has_more) && (
        <div class="pagination">
          {offset > 0 ? (
            <a href={buildUrl(filters, { offset: Math.max(0, offset - limit) })}>&#8592; Zurück</a>
          ) : (
            <span style="color: var(--color-ghost);">&#8592; Zurück</span>
          )}
          <span class="current">Seite {currentPage} von {pageCount}</span>
          {has_more ? (
            <a href={buildUrl(filters, { offset: offset + limit })}>Weiter &#8594;</a>
          ) : (
            <span style="color: var(--color-ghost);">Weiter &#8594;</span>
          )}
        </div>
      )}
    </Layout>
  );
};
