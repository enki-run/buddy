import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { NodeService } from "../../src/services/node";
import { EdgeService } from "../../src/services/edge";
import { ProjectService } from "../../src/services/project";
import { TaskService } from "../../src/services/task";
import { IntegrityService } from "../../src/services/integrity";
import { ContextService } from "../../src/services/context";
import { ActivityService } from "../../src/services/activity";

const TEST_TOKEN = "test-encryption-token-32chars!!";

describe("End-to-end Workflow", () => {
  let activityService: ActivityService;
  let nodeService: NodeService;
  let edgeService: EdgeService;
  let projectService: ProjectService;
  let taskService: TaskService;
  let integrityService: IntegrityService;
  let contextService: ContextService;

  beforeEach(async () => {
    // Clean up in FK-safe order
    await env.DB.prepare("DELETE FROM activity_log").run();
    await env.DB.prepare("DELETE FROM edges").run();
    await env.DB.prepare("DELETE FROM tasks").run();
    await env.DB.prepare("DELETE FROM projects").run();
    await env.DB.prepare("DELETE FROM nodes").run();

    // Instantiate all services
    activityService = new ActivityService(env.DB);
    edgeService = new EdgeService(env.DB, activityService);
    nodeService = new NodeService(env.DB, activityService);
    projectService = new ProjectService(env.DB, activityService, edgeService);
    taskService = new TaskService(env.DB, activityService, edgeService);
    integrityService = new IntegrityService(env.DB);
    contextService = new ContextService(env.DB);
  });

  it("complete workflow: context_load → save_node → init_project → link → get_related → create_task → complete → integrity", async () => {
    // 1. context_load on empty DB → hint present, zero stats
    const ctx1 = await contextService.load();
    expect(ctx1.hint).toBeDefined();
    expect(ctx1.stats.nodes).toBe(0);
    expect(ctx1.stats.projects).toBe(0);

    // 2. save_node → creates concept node
    const node = await nodeService.save({
      type: "concept",
      title: "Agent Mesh",
      content: "NATS-based messaging",
    });
    expect(node.id).toBeDefined();
    expect(node.type).toBe("concept");
    expect(node.title).toBe("Agent Mesh");

    // 3. init_project
    const project = await projectService.create({ name: "enki.run", context: "dev" });
    expect(project.id).toBeDefined();
    expect(project.name).toBe("enki.run");

    // 4. link_nodes → project relates_to node
    const edge = await edgeService.link({
      from_type: "project",
      from_id: project.id,
      to_type: "node",
      to_id: node.id,
      relation: "relates_to",
      note: "Core component",
    });
    expect(edge.id).toBeDefined();
    expect(edge.relation).toBe("relates_to");

    // 5. get_related → returns the connection
    const related = await edgeService.getRelated({
      entity_type: "project",
      entity_id: project.id,
      direction: "outgoing",
      limit: 50,
      offset: 0,
    });
    expect(related.data.length).toBe(1);
    expect(related.data[0].edge.relation).toBe("relates_to");
    expect(related.data[0].edge.to_id).toBe(node.id);

    // 6. create_task for project
    const task = await taskService.create({
      title: "Setup NATS",
      project_id: project.id,
      priority: "high",
    });
    expect(task.id).toBeDefined();
    expect(task.title).toBe("Setup NATS");
    expect(task.priority).toBe("high");
    expect(task.project_id).toBe(project.id);

    // 7. save another node as task result
    const resultNode = await nodeService.save({
      type: "decision",
      title: "ADR: NATS over RabbitMQ",
    });
    expect(resultNode.id).toBeDefined();

    // 8. complete_task with result_node_id → creates produced_by edge
    const completedTask = await taskService.complete(task.id, resultNode.id);
    expect(completedTask).not.toBeNull();
    expect(completedTask!.status).toBe("done");
    expect(completedTask!.completed_at).toBeDefined();

    // 9. Verify produced_by edge exists between task and result node
    const taskEdges = await edgeService.getRelated({
      entity_type: "task",
      entity_id: task.id,
      direction: "outgoing",
      limit: 50,
      offset: 0,
    });
    expect(taskEdges.data.some((d) => d.edge.relation === "produced_by")).toBe(true);
    expect(taskEdges.data.some((d) => d.edge.to_id === resultNode.id)).toBe(true);

    // 10. context_load now returns data
    const ctx2 = await contextService.load();
    expect(ctx2.hint).toBeUndefined();
    expect(ctx2.stats.nodes).toBe(2);
    expect(ctx2.stats.projects).toBe(1);
    // relates_to edge + produced_by edge = at least 2
    expect(ctx2.stats.edges).toBeGreaterThanOrEqual(2);

    // 11. Graph integrity check → 0 errors
    const integrity = await integrityService.validate();
    expect(integrity.orphaned.length).toBe(0);
    expect(integrity.invalid.length).toBe(0);

    // 12. Delete node → edges cleaned up atomically by NodeService.delete()
    await nodeService.delete(node.id);
    const integrity2 = await integrityService.validate();
    // The relates_to edge to node (now deleted) should be gone — NodeService deletes edges atomically
    expect(integrity2.orphaned.length).toBe(0);

    // 13. Search via FTS5 — remaining node (resultNode) still findable
    const searchResult = await nodeService.search({
      query: "NATS RabbitMQ",
      limit: 50,
      offset: 0,
    });
    expect(searchResult.data.length).toBe(1);
    expect(searchResult.data[0].title).toBe("ADR: NATS over RabbitMQ");
  });

  it("recurring task workflow", async () => {
    // Create recurring task with due_date
    const task = await taskService.create({
      title: "Check SSL certs",
      recurring: "quarterly",
      due_date: "2026-04-01",
      context: "dev",
    });
    expect(task.id).toBeDefined();
    expect(task.recurring).toBe("quarterly");
    expect(task.due_date).toBe("2026-04-01");
    expect(task.status).toBe("backlog");

    // Complete recurring → creates next task
    const result = await taskService.completeRecurring(task.id);
    expect(result).not.toBeNull();
    expect(result!.completed.status).toBe("done");
    expect(result!.completed.id).toBe(task.id);
    expect(result!.next.due_date).toBe("2026-07-01"); // +3 months
    expect(result!.next.recurring).toBe("quarterly");
    expect(result!.next.status).toBe("backlog");
    expect(result!.next.title).toBe("Check SSL certs");
  });

  it("secret node encryption/decryption", async () => {
    // Save a secret node — must pass encryptionToken
    const node = await nodeService.save({
      type: "secret",
      title: "API Key",
      content: "sk-abc123",
      encryptionToken: TEST_TOKEN,
    });

    expect(node.encrypted).toBe(1);
    // Content in the returned object should be the encrypted ciphertext, not plaintext
    expect(node.content).not.toBe("sk-abc123");
    expect(node.content).not.toBeNull();

    // Get without decryption → placeholder
    const fetchedNoToken = await nodeService.getById(node.id);
    expect(fetchedNoToken).not.toBeNull();
    expect(fetchedNoToken!.content).toBe("[encrypted]");

    // Get with correct token → decrypted plaintext
    const fetchedDecrypted = await nodeService.getById(node.id, { current: TEST_TOKEN });
    expect(fetchedDecrypted).not.toBeNull();
    expect(fetchedDecrypted!.content).toBe("sk-abc123");
  });

  it("edge validation rejects invalid relations", async () => {
    const node = await nodeService.save({ type: "concept", title: "Test Node" });
    const project = await projectService.create({ name: "Test Project" });

    // depends_on from project to node is not in EDGE_VALIDATION_MATRIX
    // Matrix only allows: depends_on { "node->node": true }
    let thrown: any = null;
    try {
      await edgeService.link({
        from_type: "project",
        from_id: project.id,
        to_type: "node",
        to_id: node.id,
        relation: "depends_on",
      });
    } catch (err: any) {
      thrown = err;
    }

    expect(thrown).not.toBeNull();
    expect(thrown.code).toBe("VALIDATION_ERROR");
    expect(thrown.message).toContain("depends_on");
  });

  it("context_load stats reflect actual data", async () => {
    // Create 3 nodes, 2 projects, 1 task open / 1 task done, 1 edge
    await nodeService.save({ type: "concept", title: "Node 1" });
    await nodeService.save({ type: "fact", title: "Node 2" });
    await nodeService.save({ type: "decision", title: "Node 3" });

    const p1 = await projectService.create({ name: "Project Alpha" });
    await projectService.create({ name: "Project Beta" });

    const taskOpen = await taskService.create({ title: "Open Task", project_id: p1.id });
    const taskDone = await taskService.create({ title: "Done Task" });
    await taskService.complete(taskDone.id);

    // Link two nodes
    const n1 = await nodeService.list({ limit: 10, offset: 0 });
    await edgeService.link({
      from_type: "node",
      from_id: n1.data[0].id,
      to_type: "node",
      to_id: n1.data[1].id,
      relation: "relates_to",
    });

    const ctx = await contextService.load();
    expect(ctx.stats.nodes).toBe(3);
    expect(ctx.stats.projects).toBe(2);
    expect(ctx.stats.tasks_open).toBe(1); // only open task (backlog)
    expect(ctx.stats.edges).toBe(1);
    expect(ctx.hint).toBeUndefined();
  });

  it("integrity check detects orphaned edges after manual deletion", async () => {
    const nodeA = await nodeService.save({ type: "concept", title: "Node A" });
    const nodeB = await nodeService.save({ type: "concept", title: "Node B" });

    await edgeService.link({
      from_type: "node",
      from_id: nodeA.id,
      to_type: "node",
      to_id: nodeB.id,
      relation: "relates_to",
    });

    // Manually delete nodeA without going through NodeService (bypasses edge cleanup)
    await env.DB.prepare("DELETE FROM nodes WHERE id = ?").bind(nodeA.id).run();

    const integrity = await integrityService.validate();
    // The edge now references a deleted entity → orphaned
    expect(integrity.orphaned.length).toBe(1);
    expect(integrity.orphaned[0].from_id).toBe(nodeA.id);
  });
});
