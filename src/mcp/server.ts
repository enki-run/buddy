import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../types";
import type { Env } from "../types";
import { ActivityService } from "../services/activity";
import { CacheService } from "../services/cache";
import { NodeService } from "../services/node";
import { EdgeService } from "../services/edge";
import { ProjectService } from "../services/project";
import { TaskService } from "../services/task";
import { ContextService } from "../services/context";
import { registerNodeTools } from "./tools/nodes";
import { registerEdgeTools } from "./tools/edges";
import { registerProjectTools } from "./tools/projects";
import { registerTaskTools } from "./tools/tasks";
import { registerMetaTools } from "./tools/meta";

const TOOL_GROUPS: Record<string, string[]> = {
  nodes: ["save_node", "get_node", "update_node", "delete_node", "list_nodes", "search_nodes"],
  edges: ["link_nodes", "get_related"],
  projects: ["init_project", "list_projects", "get_project", "update_project", "archive_project"],
  tasks: ["create_task", "list_tasks", "update_task", "complete_task", "move_task", "bulk_create_tasks", "complete_recurring_task"],
  meta: ["context_load", "capture_summary", "capture_inbox", "get_activity", "load_skill"],
};

const VALID_GROUPS = new Set(["nodes", "edges", "projects", "tasks", "meta", "all"]);

export function parseToolGroups(param: string | undefined): Set<string> | undefined {
  if (!param || param.trim() === "") return undefined;
  const groups = new Set(
    param
      .split(",")
      .map((g) => g.trim().toLowerCase())
      .filter((g) => VALID_GROUPS.has(g)),
  );
  if (groups.size === 0 || groups.has("all")) return undefined;
  return groups;
}

export function createMcpServer(env: Env, toolsFilter?: Set<string>): McpServer {
  const activeGroups = toolsFilter ? [...toolsFilter].sort().join(", ") : "all";

  const server = new McpServer(
    {
      name: "buddy",
      version: VERSION,
    },
    {
      instructions: [
        "buddy is an AI-native knowledge graph and project management backend.",
        `Active tool groups: ${activeGroups}.`,
        "IMPORTANT: Only use the tools listed above. If the user requests an action that requires a tool you do not have access to, clearly state that this capability is not available in your current tool set.",
      ].join(" "),
    },
  );

  // Instantiate services
  const activityService = new ActivityService(env.DB);
  const cache = env.CACHE ? new CacheService(env.CACHE) : undefined;
  const nodeService = new NodeService(env.DB, activityService);
  const edgeService = new EdgeService(env.DB, activityService);
  const projectService = new ProjectService(env.DB, activityService, edgeService);
  const taskService = new TaskService(env.DB, activityService, edgeService);
  const contextService = new ContextService(env.DB, cache);

  const reg = (group: string) => !toolsFilter || toolsFilter.has(group);

  // Register tool groups
  if (reg("nodes")) {
    registerNodeTools(server, {
      node: nodeService,
      buddyToken: env.BUDDY_TOKEN,
      buddyTokenPrevious: env.BUDDY_TOKEN_PREVIOUS,
    });
  }

  if (reg("edges")) {
    registerEdgeTools(server, { edge: edgeService });
  }

  if (reg("projects")) {
    registerProjectTools(server, { project: projectService });
  }

  if (reg("tasks")) {
    registerTaskTools(server, { task: taskService });
  }

  if (reg("meta")) {
    registerMetaTools(server, {
      context: contextService,
      node: nodeService,
      task: taskService,
      activity: activityService,
      db: env.DB,
    });
  }

  return server;
}
