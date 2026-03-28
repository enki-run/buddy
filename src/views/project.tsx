import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { Layout } from "./layout";
import type { Project, Task, Activity, Edge, Node, HealthScore } from "../types";
import { escapeHtml } from "../markdown";

interface ProjectPageProps {
  project: Project;
  tasks: Task[];
  related_nodes: Array<{ node: Node; edge: Edge }>;
  health: HealthScore | null;
  activities: Activity[];
}

const SCORE_COLOR: Record<string, string> = {
  A: "#4a7a4a", B: "#8a7350", C: "#c4b080", D: "#c08060", F: "#c08080",
};

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = dateStr.split("T")[0];
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const HealthRing: FC<{ health: HealthScore }> = ({ health }) => {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (health.points / 100) * circumference;
  const color = SCORE_COLOR[health.score] ?? "#999";

  return (
    <svg width="90" height="90" viewBox="0 0 90 90" style="flex-shrink:0;">
      <circle cx="45" cy="45" r={r} fill="none" stroke="var(--color-divider)" stroke-width="6" />
      <circle
        cx="45" cy="45" r={r} fill="none"
        stroke={color} stroke-width="6"
        stroke-dasharray={`${circumference}`}
        stroke-dashoffset={`${offset}`}
        stroke-linecap="round"
        transform="rotate(-90 45 45)"
      />
      <text x="45" y="41" text-anchor="middle" dominant-baseline="middle"
        font-family="var(--font-mono)" font-size="18" font-weight="700" fill={color}>
        {health.score}
      </text>
      <text x="45" y="57" text-anchor="middle" dominant-baseline="middle"
        font-family="var(--font-sans)" font-size="8" fill="var(--color-subtle)">
        {health.points}/100
      </text>
    </svg>
  );
};

const TASK_STATUS_ORDER = ["blocked", "in_progress", "todo", "backlog", "done", "cancelled"] as const;
const TASK_STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog", todo: "To Do", in_progress: "In Progress",
  blocked: "Blocked", done: "Done", cancelled: "Cancelled",
};
const TASK_STATUS_COLOR: Record<string, string> = {
  backlog: "var(--color-subtle)", todo: "var(--color-muted)",
  in_progress: "#8a7350", blocked: "#904040",
  done: "#4a7a4a", cancelled: "var(--color-light)",
};

const HUB_TAB_SCRIPT = raw(`<script>
(function(){
  var tabs = document.querySelectorAll('.hub-tab');
  var panels = document.querySelectorAll('.hub-panel');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) { t.classList.remove('hub-tab-active'); });
      panels.forEach(function(p) { p.style.display = 'none'; });
      this.classList.add('hub-tab-active');
      var panel = document.getElementById('panel-' + this.dataset.panel);
      if (panel) panel.style.display = 'block';
    });
  });
})();
</script>`);

export const ProjectPage: FC<ProjectPageProps> = ({
  project,
  tasks,
  related_nodes,
  health,
  activities,
}) => {
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const open = tasks.filter((t) => t.status === "backlog" || t.status === "todo").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;

  return (
    <Layout title={project.name} activePath="/project">
      <div class="hub-layout">
        {/* Sidebar: related nodes */}
        <div class="hub-sidebar">
          <div class="sidebar-section">
            <div class="sidebar-header">
              Verbundene Nodes <span class="sidebar-count">({related_nodes.length})</span>
            </div>
            {related_nodes.length === 0 ? (
              <span style="color: var(--color-light); font-size: 0.75rem;">—</span>
            ) : (
              related_nodes.map(({ node, edge }) => (
                <a class="sidebar-link" href={`/nodes/${escapeHtml(node.id)}`}>
                  <span class={`badge badge-${escapeHtml(node.type)}`} style="font-size: 0.62rem; padding: 1px 4px; margin-right: 4px;">{escapeHtml(node.type)}</span>
                  {escapeHtml(node.title)}
                  <span style="font-size: 0.62rem; color: var(--color-ghost); display: block; margin-top: 1px;">{escapeHtml(edge.relation)}</span>
                </a>
              ))
            )}
          </div>

          {project.repo && (
            <div class="sidebar-section">
              <div class="sidebar-header">Repository</div>
              <a
                href={`https://github.com/${escapeHtml(project.repo)}`}
                target="_blank"
                rel="noopener"
                class="sidebar-link"
              >
                {escapeHtml(project.repo)}
              </a>
            </div>
          )}
        </div>

        {/* Content area */}
        <div class="hub-content">
          {/* Mobile tab bar */}
          <div class="hub-tabs">
            <button class="hub-tab hub-tab-active" data-panel="focus">Tasks</button>
            <button class="hub-tab" data-panel="nodes">
              Nodes ({related_nodes.length})
            </button>
            <button class="hub-tab" data-panel="activity">Log</button>
          </div>

          {/* Header */}
          <div class="hub-header">
            {health ? (
              <HealthRing health={health} />
            ) : (
              <div style="width: 90px; height: 90px; border-radius: 50%; border: 6px solid var(--color-divider); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <span style="font-family: var(--font-mono); font-size: 1.23rem; color: var(--color-ghost);">-</span>
              </div>
            )}
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px;">
                <h1 style="font-size: 1.3rem;">{escapeHtml(project.name)}</h1>
                {project.context && (
                  <span class={`badge badge-${escapeHtml(project.context)}`}>{escapeHtml(project.context)}</span>
                )}
                <span class={`badge badge-status badge-${escapeHtml(project.status)}`}>{escapeHtml(project.status)}</span>
              </div>
              {project.description && (
                <p style="font-size: 0.85rem; color: var(--color-muted); margin-bottom: 4px;">{escapeHtml(project.description)}</p>
              )}
              <div style="font-size: 0.82rem; color: var(--color-muted);">
                {done} done · {inProgress} in progress · {open} offen
                {blocked > 0 && (
                  <span style="color: #904040; margin-left: 10px;">&#9888; {blocked} blockiert</span>
                )}
              </div>
            </div>
          </div>

          {/* Focus panel */}
          <div id="panel-focus" class="hub-panel">
            {tasks.length === 0 ? (
              <p class="empty">Keine Tasks.</p>
            ) : (
              TASK_STATUS_ORDER.map((status) => {
                const statusTasks = tasks
                  .filter((t) => t.status === status)
                  .sort((a, b) => {
                    const po: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                    return (po[a.priority] ?? 9) - (po[b.priority] ?? 9);
                  });
                if (statusTasks.length === 0) return null;
                return (
                  <div style="margin-bottom: 12px;">
                    <div style={`font-family: var(--font-mono); font-size: 0.69rem; font-weight: 700; color: ${TASK_STATUS_COLOR[status]}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;`}>
                      {TASK_STATUS_LABEL[status]} ({statusTasks.length})
                    </div>
                    {statusTasks.map((t) => (
                      <div style={`display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--color-divider); font-size: 0.85rem; ${status === "done" || status === "cancelled" ? "opacity: 0.5;" : ""}`}>
                        <span style={`font-family: var(--font-mono); font-size: 0.62rem; font-weight: 600; color: ${TASK_STATUS_COLOR[status]}; width: 50px; flex-shrink: 0;`}>
                          {escapeHtml(t.priority)}
                        </span>
                        <span style="flex: 1; color: var(--color-body);">
                          {t.is_milestone === 1 && (
                            <span style="color: #8a7350; margin-right: 4px;">&#9670;</span>
                          )}
                          {escapeHtml(t.title)}
                          {t.recurring && (
                            <span style="font-family: var(--font-mono); font-size: 0.62rem; color: var(--color-subtle); margin-left: 6px; background: var(--color-surface); padding: 1px 4px; border-radius: 3px; border: 1px solid var(--color-border);">
                              {escapeHtml(t.recurring)}
                            </span>
                          )}
                        </span>
                        {t.due_date && (
                          <span style="font-family: var(--font-mono); font-size: 0.62rem; color: var(--color-light);">
                            {fmtDate(t.due_date)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Nodes panel (mobile) */}
          <div id="panel-nodes" class="hub-panel" style="display: none;">
            {related_nodes.length === 0 ? (
              <p class="empty">Keine verbundenen Nodes.</p>
            ) : (
              related_nodes.map(({ node, edge }) => (
                <a href={`/nodes/${escapeHtml(node.id)}`} style="display: block; padding: 8px 0; border-bottom: 1px solid var(--color-divider); text-decoration: none; color: inherit;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class={`badge badge-${escapeHtml(node.type)}`}>{escapeHtml(node.type)}</span>
                    <span style="font-size: 0.85rem; flex: 1;">{escapeHtml(node.title)}</span>
                    <span style="font-size: 0.69rem; color: var(--color-subtle); font-family: var(--font-mono);">{escapeHtml(edge.relation)}</span>
                  </div>
                </a>
              ))
            )}
          </div>

          {/* Activity panel (mobile) */}
          <div id="panel-activity" class="hub-panel" style="display: none;">
            {activities.length === 0 ? (
              <p class="empty">Keine Aktivitäten.</p>
            ) : (
              <ul class="activity-list">
                {activities.slice(0, 20).map((a) => (
                  <li>
                    <time>{fmtDateTime(a.created_at)}</time>
                    {a.summary ? escapeHtml(a.summary) : escapeHtml(a.action)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity (desktop, below hub) */}
      {activities.length > 0 && (
        <div style="margin-top: 1.85rem;">
          <h2>Letzte Aktivitäten</h2>
          <ul class="activity-list">
            {activities.slice(0, 10).map((a) => (
              <li>
                <time>{fmtDateTime(a.created_at)}</time>
                {a.summary ? escapeHtml(a.summary) : escapeHtml(a.action)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {HUB_TAB_SCRIPT}
    </Layout>
  );
};
