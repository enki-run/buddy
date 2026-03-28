import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Env, NodeType, NodeStatus, Context } from "./types";
import { VERSION, LIMITS } from "./types";
import {
  authMiddleware,
  generateCsrfToken,
  validateCsrfToken,
  handleLoginSuccess,
  handleLoginFailure,
  handleLogout,
  hashIP,
} from "./auth";
import { createOAuthRoutes } from "./oauth";
import { ActivityService } from "./services/activity";
import { CacheService } from "./services/cache";
import { ContextService } from "./services/context";
import { EdgeService } from "./services/edge";
import { HealthService } from "./services/health";
import { NodeService } from "./services/node";
import { ProjectService } from "./services/project";
import { SearchService } from "./services/search";
import { TaskService } from "./services/task";
import { IntegrityService } from "./services/integrity";

// Views
import { LoginPage } from "./views/login";
import { Layout } from "./views/layout";
import { HomePage } from "./views/home";
import { NodesPage } from "./views/nodes";
import { NodeDetailPage } from "./views/node";
import { ProjectPage } from "./views/project";
import { GraphPage } from "./views/graph";
import { ActivityPage } from "./views/activity";
import { NotFoundPage } from "./views/not-found";

const app = new Hono<{ Bindings: Env }>();

// --- Security headers middleware (ALL routes) ---
app.use("*", async (c, next) => {
  await next();
  c.header("X-Buddy-Version", VERSION);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
  );
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

// --- OAuth routes (pre-auth, own auth handling) ---
app.route("/", createOAuthRoutes());

// --- Health endpoint (pre-auth) ---
app.get("/health", (c) => c.text("ok"));

// --- Auth middleware ---
app.use("*", authMiddleware);

// --- Login routes ---
app.get("/login", async (c) => {
  const csrfToken = await generateCsrfToken(c.env.BUDDY_TOKEN);
  return c.html(<LoginPage csrfToken={csrfToken} />);
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const token = body["token"] as string;
  const csrf = body["csrf"] as string;

  const activity = new ActivityService(c.env.DB);
  const clientIP = c.req.header("cf-connecting-ip") ?? "unknown";
  const ipHash = clientIP !== "unknown" ? await hashIP(clientIP) : undefined;

  const csrfValid = csrf ? await validateCsrfToken(csrf, c.env.BUDDY_TOKEN) : false;
  if (!csrfValid || token !== c.env.BUDDY_TOKEN) {
    await handleLoginFailure(activity, ipHash);
    const newCsrfToken = await generateCsrfToken(c.env.BUDDY_TOKEN);
    return c.html(<LoginPage csrfToken={newCsrfToken} error />, 401);
  }

  await handleLoginSuccess(activity, ipHash);
  setCookie(c, "buddy_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 2592000, // 30 days
  });
  return c.redirect("/");
});

app.post("/logout", async (c) => {
  const activity = new ActivityService(c.env.DB);
  const clientIP = c.req.header("cf-connecting-ip") ?? "unknown";
  const ipHash = clientIP !== "unknown" ? await hashIP(clientIP) : undefined;
  await handleLogout(activity, ipHash);
  deleteCookie(c, "buddy_session");
  return c.redirect("/login");
});

// --- MCP endpoint ---
app.all("/mcp", async (c) => {
  if (c.req.method !== "POST" && c.req.method !== "GET" && c.req.method !== "DELETE") {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
      405,
    );
  }

  const { WebStandardStreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
  );
  const { createMcpServer, parseToolGroups } = await import("./mcp/server");

  const groups = parseToolGroups(c.req.query("tools"));
  const server = createMcpServer(c.env, groups);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — new transport per request
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    const response = await transport.handleRequest(c.req.raw);
    return response;
  } catch {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null },
      500,
    );
  } finally {
    await transport.close();
    await server.close();
  }
});

// --- Dashboard: Home ---
app.get("/", async (c) => {
  const cache = new CacheService(c.env.CACHE);
  const context = new ContextService(c.env.DB, cache);
  const data = await context.load();
  return c.html(<HomePage data={data} />);
});

// --- Dashboard: Node Browser ---
app.get("/nodes", async (c) => {
  const activity = new ActivityService(c.env.DB);
  const nodeService = new NodeService(c.env.DB, activity);

  const typeParam = c.req.query("type") as NodeType | undefined;
  const contextParam = c.req.query("context") as Context | undefined;
  const statusParam = c.req.query("status") as NodeStatus | undefined;
  const offsetParam = parseInt(c.req.query("offset") ?? "0", 10);

  const limit = LIMITS.PAGINATION_DEFAULT;
  const offset = isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);

  const result = await nodeService.list({
    type: typeParam,
    context: contextParam,
    status: statusParam,
    limit,
    offset,
  });

  return c.html(
    <NodesPage
      result={result}
      filters={{ type: typeParam, context: contextParam, status: statusParam, offset }}
    />
  );
});

// --- Dashboard: Node Detail ---
app.get("/nodes/:id", async (c) => {
  const id = c.req.param("id");
  const activity = new ActivityService(c.env.DB);
  const nodeService = new NodeService(c.env.DB, activity);
  const edgeService = new EdgeService(c.env.DB, activity);

  const node = await nodeService.getById(id, {
    current: c.env.BUDDY_TOKEN,
    previous: c.env.BUDDY_TOKEN_PREVIOUS,
  });

  if (!node) {
    return c.html(<NotFoundPage />, 404);
  }

  // Fetch incoming + outgoing connections
  const [outgoingResult, incomingResult] = await Promise.all([
    edgeService.getRelated({ entity_type: "node", entity_id: id, direction: "outgoing", limit: 100, offset: 0 }),
    edgeService.getRelated({ entity_type: "node", entity_id: id, direction: "incoming", limit: 100, offset: 0 }),
  ]);

  return c.html(
    <NodeDetailPage
      node={node}
      outgoing={outgoingResult.data}
      incoming={incomingResult.data}
    />
  );
});

// --- Dashboard: Node Fragment (for potential inline loading) ---
app.get("/nodes/:id/fragment", async (c) => {
  const id = c.req.param("id");
  const activity = new ActivityService(c.env.DB);
  const nodeService = new NodeService(c.env.DB, activity);

  const node = await nodeService.getById(id, {
    current: c.env.BUDDY_TOKEN,
    previous: c.env.BUDDY_TOKEN_PREVIOUS,
  });

  if (!node) {
    return c.html(`<p class="empty">Node nicht gefunden.</p>`, 404);
  }

  // Return just the rendered markdown content as a fragment
  if (!node.content || node.encrypted === 1) {
    return c.html(`<p class="empty">${node.encrypted ? "[Inhalt verschlüsselt]" : "Kein Inhalt."}</p>`);
  }

  const { renderMarkdown } = await import("./markdown");
  return c.html(`<div class="markdown-content">${renderMarkdown(node.content)}</div>`);
});

// --- Dashboard: Project Hub ---
app.get("/project/:id", async (c) => {
  const id = c.req.param("id");
  const activity = new ActivityService(c.env.DB);
  const edgeService = new EdgeService(c.env.DB, activity);
  const projectService = new ProjectService(c.env.DB, activity, edgeService);
  const taskService = new TaskService(c.env.DB, activity, edgeService);
  const healthService = new HealthService(c.env.DB);

  const projectData = await projectService.getById(id);

  if (!projectData) {
    return c.html(<NotFoundPage />, 404);
  }

  const [tasks, activityResult, health] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY status ASC, priority ASC")
      .bind(id)
      .all<import("./types").Task>()
      .then((r) => r.results ?? []),
    activity.list({ project_id: id, limit: 20, offset: 0 }),
    healthService.calculate(id),
  ]);

  // related_nodes: only node entities from related
  const related_nodes = projectData.related_nodes.filter(
    ({ node }) => node && typeof node === "object"
  );

  return c.html(
    <ProjectPage
      project={projectData.project}
      tasks={tasks}
      related_nodes={related_nodes}
      health={health}
      activities={activityResult.data}
    />
  );
});

// --- Dashboard: Graph ---
app.get("/graph", (c) => c.html(<GraphPage />));


// --- Dashboard: Activity Log ---
app.get("/activity", async (c) => {
  const activityService = new ActivityService(c.env.DB);
  const offsetParam = parseInt(c.req.query("offset") ?? "0", 10);
  const offset = isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);
  const limit = 50;

  const result = await activityService.list({ limit, offset });
  return c.html(<ActivityPage result={result} />);
});

// --- API routes ---
app.get("/api/search", async (c) => {
  const q = c.req.query("q") || "";
  const searchService = new SearchService(c.env.DB);
  const results = await searchService.search(q);
  return c.json(results);
});

app.get("/api/graph", async (c) => {
  const db = c.env.DB;

  // Nodes
  const nodesResult = await db.prepare(
    "SELECT id, type, title, context, status FROM nodes WHERE status != 'deprecated' LIMIT 200"
  ).all();

  // Projects as virtual nodes
  const projectsResult = await db.prepare(
    "SELECT id, name as title, context, status FROM projects WHERE status != 'archived' LIMIT 50"
  ).all();

  // Active tasks as virtual nodes
  const tasksResult = await db.prepare(
    "SELECT id, title, context, status FROM tasks WHERE status IN ('in_progress', 'blocked') LIMIT 50"
  ).all();

  // Edges
  const edgesResult = await db.prepare(
    "SELECT id, from_type, from_id, to_type, to_id, relation, note FROM edges LIMIT 500"
  ).all();

  const graphNodes = [
    ...(nodesResult.results ?? []).map((n: any) => ({ id: n.id, type: n.type, title: n.title, context: n.context, status: n.status })),
    ...(projectsResult.results ?? []).map((p: any) => ({ id: p.id, type: "project", title: p.title, context: p.context, status: p.status })),
    ...(tasksResult.results ?? []).map((t: any) => ({ id: t.id, type: "task", title: t.title, context: t.context, status: t.status })),
  ];

  // Only include edges where both source and target exist in our node set
  const nodeIds = new Set(graphNodes.map((n) => n.id));
  const graphEdges = (edgesResult.results ?? [])
    .filter((e: any) => nodeIds.has(e.from_id) && nodeIds.has(e.to_id))
    .map((e: any) => ({ source: e.from_id, target: e.to_id, relation: e.relation, note: e.note }));

  return c.json({ nodes: graphNodes, edges: graphEdges });
});

app.get("/api/integrity", async (c) => {
  const integrityService = new IntegrityService(c.env.DB);
  const report = await integrityService.validate();
  return c.json(report);
});

// --- 404 catch-all ---
app.notFound((c) => {
  return c.html(<NotFoundPage />, 404);
});

export default app;
