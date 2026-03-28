import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { Activity, PaginatedResult } from "../types";
import { escapeHtml } from "../markdown";

interface ActivityPageProps {
  result: PaginatedResult<Activity>;
}

const ACTION_ICONS: Record<string, string> = {
  node_created: "●",
  node_updated: "◐",
  node_deleted: "○",
  project_created: "◉",
  project_updated: "◐",
  project_archived: "◌",
  task_created: "○",
  task_completed: "◉",
  task_updated: "◐",
  task_moved: "→",
  edge_created: "⊕",
  edge_deleted: "⊖",
  login_success: "▷",
  login_failure: "▸",
  logout: "◁",
};

const ACTION_COLOR: Record<string, string> = {
  node_created: "var(--color-status-active-text)",
  project_created: "var(--color-status-active-text)",
  task_completed: "var(--color-status-active-text)",
  login_failure: "#904040",
  node_deleted: "#904040",
};

function entityUrl(a: Activity): string | null {
  if (!a.entity_type || !a.entity_id) return null;
  switch (a.entity_type) {
    case "node": return `/nodes/${a.entity_id}`;
    case "project": return `/project/${a.entity_id}`;
    default: return a.project_id ? `/project/${a.project_id}` : null;
  }
}

export const ActivityPage: FC<ActivityPageProps> = ({ result }) => {
  const { data: activities, total, has_more, offset, limit } = result;

  // Group by date
  const grouped: Record<string, Activity[]> = {};
  for (const a of activities) {
    const date = new Date(a.created_at).toLocaleDateString("de-DE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(a);
  }

  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;

  return (
    <Layout title="Aktivitätslog" activePath="/activity">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.23rem; flex-wrap: wrap;">
        <h1 style="font-size: 1.38rem;">Aktivitätslog</h1>
        <span style="font-family: var(--font-mono); font-size: 0.77rem; color: var(--color-subtle);">{total} total</span>
      </div>

      {activities.length === 0 ? (
        <p class="empty">Keine Aktivitäten.</p>
      ) : (
        Object.entries(grouped).map(([date, items]) => (
          <div style="margin-bottom: 1.85rem;">
            <div style="font-family: var(--font-mono); font-size: 0.77rem; font-weight: 600; color: var(--color-subtle); text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 0.46rem; border-bottom: 1px solid var(--color-divider); margin-bottom: 0.62rem;">
              {date}
            </div>
            {items.map((a) => {
              const url = entityUrl(a);
              return (
                <div style="display: flex; gap: 0.77rem; padding: 0.46rem 0; align-items: flex-start;">
                  <span style={`font-family: var(--font-mono); font-size: 0.85rem; color: ${ACTION_COLOR[a.action] || "var(--color-ghost)"}; min-width: 1.2rem; text-align: center; line-height: 1.6;`}>
                    {ACTION_ICONS[a.action] || "·"}
                  </span>
                  <div style="flex: 1; min-width: 0;">
                    {url ? (
                      <a href={url} style="font-size: 0.92rem; color: var(--color-body); text-decoration: none;">
                        {a.summary ? escapeHtml(a.summary) : escapeHtml(a.action)}
                      </a>
                    ) : (
                      <div style="font-size: 0.92rem; color: var(--color-body);">
                        {a.summary ? escapeHtml(a.summary) : escapeHtml(a.action)}
                      </div>
                    )}
                    <div style="font-family: var(--font-mono); font-size: 0.69rem; color: var(--color-light); margin-top: 0.15rem;">
                      {new Date(a.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                      {a.entity_type && (
                        <span style="margin-left: 0.62rem; color: var(--color-ghost);">{escapeHtml(a.entity_type)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Pagination */}
      {(offset > 0 || has_more) && (
        <div class="pagination">
          {offset > 0 ? (
            <a href={`/activity?offset=${prevOffset}`}>&#8592; Neuere</a>
          ) : (
            <span style="color: var(--color-ghost);">&#8592; Neuere</span>
          )}
          <span class="current">{offset + 1}–{Math.min(offset + limit, total)} von {total}</span>
          {has_more ? (
            <a href={`/activity?offset=${nextOffset}`}>Ältere &#8594;</a>
          ) : (
            <span style="color: var(--color-ghost);">Ältere &#8594;</span>
          )}
        </div>
      )}
    </Layout>
  );
};
