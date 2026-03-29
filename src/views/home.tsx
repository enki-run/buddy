import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { ContextLoadResult } from "../types";
import { escapeHtml } from "../markdown";
import { raw } from "hono/html";

interface HomeProps {
  data: ContextLoadResult;
  csrfToken?: string;
}

/** Format ISO datetime to short local string */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const SCORE_COLOR: Record<string, string> = {
  A: "#4a7a4a", B: "#8a7350", C: "#c4b080", D: "#c08060", F: "#c08080",
};

const TASK_STATUS_COLOR: Record<string, string> = {
  in_progress: "#8a7350",
  blocked: "#904040",
  backlog: "var(--color-subtle)",
  todo: "var(--color-muted)",
  done: "#4a7a4a",
  cancelled: "var(--color-light)",
};

const TASK_STATUS_LABEL: Record<string, string> = {
  in_progress: "IN PROGRESS",
  blocked: "BLOCKED",
  backlog: "BACKLOG",
  todo: "TODO",
  done: "DONE",
  cancelled: "CANCELLED",
};

export const HomePage: FC<HomeProps> = ({ data, csrfToken }) => {
  const { stats, projects, tasks_attention, drafts, recent_activity, hint } = data;

  return (
    <Layout title="Dashboard" activePath="/" csrfToken={csrfToken}>
      {/* Stats row */}
      <div class="stats-bar">
        <div>
          <strong>{stats.nodes}</strong> Nodes
        </div>
        <div>
          <strong>{stats.projects}</strong> Projekte
        </div>
        <div>
          <strong>{stats.tasks_open}</strong> offene Tasks
        </div>
        <div>
          <strong>{stats.edges}</strong> Verbindungen
        </div>
      </div>

      {/* Bento grid */}
      <div class="bento-grid">
        {/* Left: Projects */}
        <div>
          <h2>Projekte</h2>
          {projects.length === 0 ? (
            <p class="empty">Noch keine Projekte.</p>
          ) : (
            projects.map((p) => (
              <a href={`/project/${escapeHtml(p.id)}`} class="bento-tile" style="display: block; text-decoration: none; color: inherit; margin-bottom: 0.46rem;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  {/* Health indicator */}
                  {p.health ? (
                    <div style={`width: 32px; height: 32px; border-radius: 50%; border: 2px solid ${SCORE_COLOR[p.health.score] ?? "#999"}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;`}>
                      {raw(`<span style="font-family: var(--font-mono); font-size: 0.77rem; font-weight: 700; color: ${SCORE_COLOR[p.health.score] ?? "#999"};">${escapeHtml(p.health.score)}</span>`)}
                    </div>
                  ) : (
                    <div style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--color-border); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                      <span style="font-family: var(--font-mono); font-size: 0.77rem; color: var(--color-ghost);">-</span>
                    </div>
                  )}
                  <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                      <span style="font-weight: 600; font-size: 0.92rem; color: var(--color-ink);">{escapeHtml(p.name)}</span>
                      {p.context && (
                        <span class={`badge badge-${escapeHtml(p.context)}`}>{escapeHtml(p.context)}</span>
                      )}
                      <span class={`badge badge-status badge-${escapeHtml(p.status)}`}>{escapeHtml(p.status)}</span>
                    </div>
                  </div>
                  {p.health && (
                    <div style="text-align: right; flex-shrink: 0;">
                      <div style={`font-family: var(--font-mono); font-size: 0.77rem; font-weight: 600; color: ${SCORE_COLOR[p.health.score] ?? "#999"};`}>{p.health.points}pt</div>
                    </div>
                  )}
                </div>
              </a>
            ))
          )}
        </div>

        {/* Right: Sidebar */}
        <div class="bento-sidebar">
          {/* Attention tasks */}
          {tasks_attention.length > 0 && (
            <div>
              <h2>Braucht Aufmerksamkeit</h2>
              {tasks_attention.map((t) => (
                <div class={`bento-tile attention-item${t.status === "blocked" ? " attention-item-red" : " attention-item-yellow"}`} style="margin-bottom: 0.31rem;">
                  <span class="attention-label" style={`color: ${TASK_STATUS_COLOR[t.status] ?? "var(--color-subtle)"};`}>
                    {TASK_STATUS_LABEL[t.status] ?? escapeHtml(t.status)}
                  </span>
                  <span class="attention-title">{escapeHtml(t.title)}</span>
                  {t.project_name && (
                    <span class="attention-meta">{escapeHtml(t.project_name)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Draft nodes */}
          {drafts.length > 0 && (
            <div>
              <h2>Entwürfe</h2>
              {drafts.map((d) => (
                <a href={`/nodes/${escapeHtml(d.id)}`} class="bento-tile" style="display: block; text-decoration: none; color: inherit; margin-bottom: 0.31rem;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class={`badge badge-${escapeHtml(d.type)}`}>{escapeHtml(d.type)}</span>
                    <span style="font-size: 0.85rem; font-weight: 500; flex: 1;">{escapeHtml(d.title)}</span>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Recent activity */}
          <div>
            <h2>Aktivität</h2>
            {recent_activity.length === 0 ? (
              <p class="empty">Noch keine Aktivitäten.</p>
            ) : (
              <ul class="activity-list">
                {recent_activity.map((a) => (
                  <li>
                    <time>{fmtDate(a.created_at)}</time>
                    {a.summary ? escapeHtml(a.summary) : escapeHtml(a.action)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Empty state hint */}
      {hint && (
        <div style="margin-top: 1.85rem; padding: 1.23rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.46rem;">
          <p style="font-size: 0.85rem; color: var(--color-muted); font-family: var(--font-mono);">{escapeHtml(hint)}</p>
        </div>
      )}
    </Layout>
  );
};
