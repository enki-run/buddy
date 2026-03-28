# Cloudflare API Token Setup

wrangler needs a Cloudflare API Token to create D1 databases, KV namespaces, and deploy Workers. This guide walks through creating one with the minimum required permissions.

---

## Step-by-Step

### 1. Open the API Token Page

Go to **[https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)** (Cloudflare Dashboard → top-right avatar → **My Profile** → **API Tokens**).

### 2. Create a Custom Token

Click **Create Token**, then scroll down and click **Create Custom Token** (do not use a preset template).

### 3. Name the Token

Give it a recognisable name, e.g. `buddy-deploy`.

### 4. Set Permissions

Add the following permission rows. Each row has three dropdowns: resource type, resource name, and access level.

| Resource Type | Resource Name | Access Level |
|---|---|---|
| Account | D1 | Edit |
| Account | Workers Scripts | Edit |
| Account | Workers KV Storage | Edit |
| Zone | Workers Routes | Edit |
| Zone | DNS | Edit |

The Zone-level permissions (Workers Routes, DNS) are only needed if you want to configure a custom domain. If you are using the `.workers.dev` URL only, you can skip those two rows.

### 5. Set Account and Zone Resources

- **Account Resources:** Select **Include** → choose your account (or "All accounts")
- **Zone Resources:** Select **Include** → choose the specific zone (domain) buddy will be deployed to, or "All zones"

### 6. Set TTL (optional but recommended)

- For local development: leave TTL empty (no expiry)
- For CI/CD pipelines: set a 90-day expiry

### 7. Create and Copy the Token

Click **Continue to summary**, review the permissions, then click **Create Token**.

**Copy the token now** — Cloudflare only shows it once.

---

## Configuring wrangler

Set the token as an environment variable before running wrangler commands:

```bash
export CLOUDFLARE_API_TOKEN="your-token-here"
wrangler deploy
```

Or add it to your shell profile (`~/.zshrc`, `~/.bashrc`) so it persists across sessions.

Alternatively, wrangler stores credentials after `wrangler login` (browser OAuth), but an API Token is preferable for automation and CI/CD.

---

## Verifying the Token

```bash
wrangler whoami
```

Expected output includes your account name and email. If you see an authentication error, check that the token has the correct permissions and that the account/zone resources are scoped correctly.

---

## Security Notes

- Never commit the API token to a repository
- Never put it in `wrangler.toml`
- Use a `.env` file or your CI/CD secret store
- Rotate the token if it is ever exposed — create a new one and delete the old one from the Cloudflare dashboard
