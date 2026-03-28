# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.0.0] - 2026-03-28

### Added
- 25 MCP Tools across 5 groups: Nodes (6), Edges (2), Projects (5), Tasks (7), Meta (5)
- Knowledge Graph with typed edges and validation matrix (7 relation types)
- Unified Node model replacing 5 separate entities (knowledge, documents, memories, variables, skills)
- Node types: concept, fact, decision, template, secret, config
- AES-256-GCM encryption for secret nodes via HKDF-SHA256 key derivation
- Two-key rotation model for secret re-encryption (BUDDY_TOKEN_PREVIOUS)
- Dashboard with 9 views: Home, Node Browser, Node Detail, Project Hub, Graph, Activity, Login, 404, Layout
- D3.js force-directed graph visualization with zoom/pan, arrowheads, edge labels
- Health Score per project (35% momentum, 35% deadlines, 30% freshness)
- Token-optimized context_load (<800 tokens) with KV cache (60s TTL)
- Graph integrity validation (orphaned/invalid edge detection, health score impact)
- OAuth 2.1 with mandatory PKCE (S256), compatible with Claude.ai, Gemini CLI, Mistral Le Chat
- Tool filtering via ?tools= query parameter
- Security audit trail (auth events with hashed IP)
- Activity log rotation (configurable retention, default 90 days)
- Recurring tasks (weekly, monthly, quarterly, yearly) replacing Actions entity
- FTS5 full-text search on nodes
- Pagination on all list endpoints
- Input validation via Zod (content 100KB, title 500 chars, etc.)
- Tool annotations (readOnlyHint, destructiveHint, idempotentHint)
- System font stack (no external font requests)
- Dark/light theme with zoom controls (S/M/L)
- Command palette (Cmd+K) with unified search
- Complete documentation (installation, MCP tools reference, graph integrity, token rotation)

### Security
- Bearer + Cookie authentication with timing-safe HMAC comparison
- Content Security Policy on all responses
- Custom HTML sanitizer (tag-allowlist, Workers-compatible)
- HTML escaping on all non-markdown rendered fields
- CSRF protection on login form
- workers_dev = false (no public .workers.dev route)
- Minimum token entropy warning (< 32 hex chars)

[3.0.0]: https://github.com/nxio-me/buddy/releases/tag/v3.0.0
