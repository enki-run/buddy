# buddy — Agent-first Knowledge Graph

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://github.com/nxio-me/buddy/actions/workflows/ci.yml/badge.svg)](https://github.com/nxio-me/buddy/actions)

> A graph-based knowledge substrate for LLMs and AI agents, with a human-readable dashboard.

buddy is an MCP server that provides 25 tools for managing a knowledge graph. Agents store concepts, facts, decisions, templates, and configs as **Nodes**, connected by typed **Edges**. Humans see everything through a server-rendered dashboard.

## Features

- **Unified Node Model** — One entity type replaces 5 (knowledge, documents, memories, variables, skills)
- **Knowledge Graph** — Typed edges between nodes, projects, and tasks with a validation matrix
- **25 MCP Tools** — CRUD, full-text search (FTS5), graph traversal, context loading
- **Health Score** — Per-project score (A-F) based on momentum, deadlines, freshness
- **Dashboard** — Node browser, graph visualization (D3.js), project hub, activity log
- **OAuth 2.1** — PKCE enforced, compatible with Claude.ai, Gemini CLI, Mistral Le Chat
- **Encryption** — AES-256-GCM for `secret` nodes via HKDF key derivation
- **Graph Integrity** — Automatic validation, orphan detection, health score impact
- **Token-optimized** — `context_load` designed for minimal token usage (<800 tokens)

## Quick Start

```bash
# 1. Clone
git clone git@github.com:nxio-me/buddy.git && cd buddy

# 2. Install + configure
npm install
cp wrangler.toml.example wrangler.toml

# 3. Create D1 database
wrangler d1 create buddy
# → Copy database_id into your wrangler.toml

# 4. Create KV namespace
wrangler kv namespace create CACHE
# → Copy id into your wrangler.toml

# 5. Run migrations
npm run migrate

# 6. Set token (min 32 hex chars)
openssl rand -hex 32
wrangler secret put BUDDY_TOKEN

# 7. Deploy
npm run deploy
```

See [docs/installation.md](docs/installation.md) for custom domain, rate limiting, and local development setup.

## MCP Configuration

```json
{
  "mcpServers": {
    "buddy": {
      "url": "https://buddy.yourdomain.com/mcp",
      "headers": { "Authorization": "Bearer <BUDDY_TOKEN>" }
    }
  }
}
```

OAuth 2.1 discovery: `/.well-known/oauth-authorization-server`

### Tool Filtering

Limit exposed tools via `?tools=` query parameter:

```
/mcp?tools=nodes       — Node + Edge tools only
/mcp?tools=tasks       — Task tools only
/mcp?tools=nodes,tasks — Combination
/mcp                   — All 25 tools
```

## Node Types

| Type | Description | Replaces (v2) |
|---|---|---|
| `concept` | Conceptual knowledge | Knowledge |
| `fact` | Atomic, verifiable facts | Memory |
| `decision` | Architecture decisions, ADRs | Document |
| `template` | Methods, prompt templates, workflows | Skill |
| `secret` | Encrypted credentials (AES-256-GCM) | Variable (secret) |
| `config` | Configuration values, URLs, flags | Variable (plain) |

## Edge Relations

| Relation | Allowed between |
|---|---|
| `depends_on` | Node → Node |
| `relates_to` | Any combination |
| `supersedes` | Node → Node |
| `documented_by` | Node/Project → Node |
| `deployed_on` | Node → Node |
| `implements` | Node → Node |
| `produced_by` | Node/Task → Node |

## Dashboard

| Route | Description |
|---|---|
| `/` | Home — health score, attention tasks, drafts, activity, stats |
| `/nodes` | Node browser — filter by type, context, status |
| `/nodes/:id` | Node detail — rendered markdown, edges, integrity |
| `/project/:id` | Project hub — tasks, related nodes, health |
| `/graph` | Knowledge graph — D3.js force-directed, zoom/pan |
| `/activity` | Activity log with security audit trail |

System fonts (no external requests). Dark/light theme. Zoom S/M/L.

## Documentation

- [Installation Guide](docs/installation.md) — Full setup including rate limiting
- [Cloudflare API Token](docs/cloudflare-token.md) — Required permissions
- [MCP Tools Reference](docs/mcp-tools.md) — All 25 tools with examples
- [Graph Integrity](docs/graph-integrity.md) — Validation matrix, health score
- [Token Rotation](docs/token-rotation.md) — BUDDY_TOKEN rotation, secret re-encryption

## Tech Stack

- **Runtime:** Cloudflare Workers (V8 Isolates)
- **Database:** Cloudflare D1 (SQLite + FTS5)
- **Cache:** Cloudflare KV (60s TTL)
- **Framework:** [Hono](https://hono.dev) v4
- **MCP:** [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) v1.27

## MCP Provider Compatibility

buddy works natively with every major MCP-compatible AI provider:

| Provider | Connection | Status |
|---|---|---|
| **Claude** (Anthropic) | OAuth 2.1 (Claude.ai), Bearer token (Claude Code), MCP config (Claude Desktop) | Fully supported on all platforms |
| **Mistral** (Le Chat) | OAuth 2.1, sovereign European AI | Natively compatible |
| **Gemini CLI** (Google) | OAuth 2.1 | Natively compatible |
| **Any MCP client** | Bearer token or OAuth 2.1 with PKCE | Streamable HTTP transport |

## buddy vs. Alternatives

| Feature | buddy | Mem0 | Zep | Linear |
|---|:---:|:---:|:---:|:---:|
| Graph-based (Nodes + Edges) | Yes | No | No | No |
| MCP-native | Yes | Yes | Yes | No |
| Self-hosted (Cloudflare) | Yes | Cloud | Cloud | Cloud |
| Agent-first design | Yes | Yes | Yes | No |
| Dashboard included | Yes | No | No | Yes |
| Encryption (secrets) | Yes | No | No | No |
| Open Source | Apache 2.0 | Partial | Partial | No |

## Roadmap

**buddy Team** — Multi-user edition with shared knowledge graphs. Scopes (personal / team / org), role-based access (admin / member / reader), optimistic locking for concurrent edits. Single codebase with `--mode=team` flag.

**buddy On-Prem** — Docker self-hosted deployment for environments where data must not leave the network. SQLite-based, no cloud dependencies. Same MCP interface, same dashboard.

**Signal Service** — External ingest endpoint for GitHub webhooks, CI/CD events, and monitoring alerts. Separate microservice that feeds into buddy via MCP after LLM-based relevance filtering.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, dev setup, and how to add tools or views.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

Apache 2.0 — see [LICENSE](LICENSE)
