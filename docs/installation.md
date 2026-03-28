# Installation Guide

## Prerequisites

- **Node.js 20+**
- **wrangler CLI** — `npm install -g wrangler`
- **Cloudflare account** — Free tier is sufficient
- **Cloudflare API Token** — see [cloudflare-token.md](cloudflare-token.md)

Authenticate wrangler with your Cloudflare account:

```bash
wrangler login
```

---

## Step 1 — Clone the Repository

```bash
git clone git@github.com:enki-run/buddy.git
cd buddy
npm install
cp wrangler.toml.example wrangler.toml
```

---

## Step 2 — Create the D1 Database

```bash
wrangler d1 create buddy-v3
```

The command prints output like:

```
[[d1_databases]]
binding = "DB"
database_name = "buddy-v3"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "buddy-v3"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← paste here
migrations_dir = "migrations"
```

---

## Step 3 — Create the KV Namespace

buddy uses KV for caching `context_load` and stats (60-second TTL).

```bash
wrangler kv namespace create CACHE
```

Output:

```
[[kv_namespaces]]
binding = "CACHE"
id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

Paste the `id` into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"   # ← paste here
```

---

## Step 4 — Run Migrations

Apply the schema to the remote D1 database:

```bash
npm run migrate
```

This runs `wrangler d1 migrations apply buddy-v3 --remote` and executes:

- `migrations/0001_initial.sql` — nodes, edges, projects, tasks, activity_log tables + indexes
- `migrations/0002_fts.sql` — FTS5 virtual table + INSERT/UPDATE/DELETE triggers
- `migrations/0003_node_url.sql` — optional `url` column on nodes for external links

For local development only:

```bash
npm run migrate:local
```

---

## Step 5 — Set the Secret Token

Generate a cryptographically strong token:

```bash
openssl rand -hex 32
```

Set it as a Cloudflare secret (never put it in `wrangler.toml` or commit it):

```bash
wrangler secret put BUDDY_TOKEN
```

Paste the token when prompted. The token must be at least 32 hex characters — shorter tokens produce a warning at Worker startup and weaken encryption of `secret` nodes.

---

## Step 6 — Deploy

```bash
npm run deploy
```

The Worker is live at `https://buddy.<your-account>.workers.dev`.

> **Recommendation:** Disable the `.workers.dev` URL in production and use a custom domain instead. `workers_dev = false` is already set in `wrangler.toml`. With `workers_dev = false`, the Worker is only reachable via routes you configure explicitly.

---

## Step 7 (Optional) — Custom Domain

1. Open **Cloudflare Dashboard** → **Workers & Pages** → **buddy**
2. Go to **Settings** → **Domains & Routes**
3. Click **Add Custom Domain**
4. Enter your domain (e.g. `buddy.yourdomain.com`) and confirm

Cloudflare provisions the DNS record and TLS certificate automatically. This requires that the domain's DNS is managed by Cloudflare.

---

## Step 8 (Optional) — Rate Limiting

Configure rate limiting in the Cloudflare Dashboard under **Security** → **WAF** → **Rate limiting rules**.

Recommended rules:

| Path | Limit | Action | Duration |
|---|---|---|---|
| `/login` | 10 req/min per IP | Block | 10 minutes |
| `/oauth/*` | 20 req/min per IP | Block | 5 minutes |
| `/mcp` | 300 req/min per IP | Block | 1 minute |
| `/api/*` | 60 req/min per IP | Block | 1 minute |

**Important:** If you use a custom domain, configure rate limiting rules for **both** your custom domain route and the `.workers.dev` route. Alternatively, disable `.workers.dev` entirely (`workers_dev = false` in `wrangler.toml` — already the default) so the `.workers.dev` URL returns a 404 and only your custom domain is reachable.

---

## MCP Client Configuration

Add buddy to your MCP client configuration (e.g. `~/.claude/mcp.json` for Claude Code):

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

Replace `<BUDDY_TOKEN>` with the token you set in Step 5.

### OAuth 2.1 Clients

Claude.ai and other OAuth-capable clients discover the server automatically via:

```
GET /.well-known/oauth-authorization-server
```

No manual token configuration is needed — the OAuth flow handles authentication.

---

## Local Development

Create a `.dev.vars` file (never commit it):

```ini
BUDDY_TOKEN=dev
```

Start the dev server:

```bash
npm run dev
```

The server runs at `http://localhost:8787` with hot reload and a local D1 database.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `BUDDY_TOKEN` | Yes | Authentication token (min 32 hex chars) |
| `BUDDY_TOKEN_PREVIOUS` | No | Previous token during key rotation (see [token-rotation.md](token-rotation.md)) |
| `ACTIVITY_LOG_RETENTION_DAYS` | No | Days to keep activity log entries (default: 90) |
| `CORS_ORIGIN` | No | Allowed CORS origin for separate frontends |
