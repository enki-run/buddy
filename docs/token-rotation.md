# Token Rotation

`BUDDY_TOKEN` serves two purposes: it authenticates all access to buddy (MCP + dashboard) and its entropy is used as the key material for encrypting `secret` nodes. This means rotating the token has two effects:

1. All existing sessions are immediately invalidated.
2. All `secret` nodes were encrypted with the old key and must be re-encrypted with the new key.

---

## Simple Rotation (no secret nodes)

If you have no nodes with `type: secret`, rotation is straightforward:

```bash
# Generate a new token (min 32 hex chars)
openssl rand -hex 32

# Set the new token in Cloudflare
wrangler secret put BUDDY_TOKEN
# Paste the new token when prompted
```

The new token takes effect immediately on the next Worker request. All browser sessions and MCP clients using the old token will receive `401 Unauthorized` and must re-authenticate.

**After rotation:**

1. Update the `BUDDY_TOKEN` in your MCP client configuration (e.g. `~/.claude/mcp.json`).
2. Log in to the dashboard again at `/login`.

---

## Rotation with Secret Nodes (Two-Key Model)

If you have nodes with `type: secret`, their content is encrypted with a key derived from the old `BUDDY_TOKEN`. After rotating to a new token, those nodes can no longer be decrypted — until they are re-encrypted with the new key.

The two-key model prevents data loss if the re-encryption script is interrupted:

### Step 1 — Set the new token

```bash
wrangler secret put BUDDY_TOKEN
# Enter the new token
```

### Step 2 — Set the old token as a fallback

```bash
wrangler secret put BUDDY_TOKEN_PREVIOUS
# Enter the OLD token (the one you just replaced)
```

With `BUDDY_TOKEN_PREVIOUS` set, `get_node` will automatically try decrypting with the new key first, and fall back to the old key if that fails. This means all secret nodes remain readable during the migration window.

### Step 3 — Re-encrypt all secret nodes

The Worker handles re-encryption automatically: `get_node` tries the new key first, falls back to the old key, and `update_node` always encrypts with the current key. To re-encrypt all secrets, use the MCP tools:

```bash
# Via MCP: list all secret nodes, then update each to trigger re-encryption
# The update_node call reads with fallback (new key → old key) and writes with new key

# Or via D1 directly — find all encrypted nodes:
wrangler d1 execute <DB_NAME> --remote --command \
  "SELECT id, title FROM nodes WHERE encrypted = 1"

# Then for each, call update_node via MCP to trigger re-encryption:
# update_node(id, { content: get_node(id).content })
```

The process is idempotent — nodes already encrypted with the new key are read and written with the same key (no-op). If interrupted, re-run for any remaining nodes.

### Step 4 — Remove the old token

Once the script completes with no errors:

```bash
wrangler secret delete BUDDY_TOKEN_PREVIOUS
```

The fallback decryption path is now removed.

---

## Security Notes

- Never commit `BUDDY_TOKEN` to a repository or put it in `wrangler.toml`.
- The token must be at least 32 hex characters (128 bits of entropy). The Worker logs a warning at startup if the token is shorter.
- `BUDDY_TOKEN` should be treated as a root credential — it grants full read/write access including decryption of all secrets.
- If the token is suspected to be compromised, rotate immediately (Step 1 above) to invalidate all active sessions, then complete the re-encryption process.

---

## Effect on OAuth Sessions

OAuth access tokens issued via the OAuth 2.1 flow are derived from `BUDDY_TOKEN`. After rotation, all previously issued access tokens are immediately invalid. OAuth clients will need to complete the authorization flow again to obtain a new access token.

---

## Encryption Algorithm Reference

- **Algorithm:** AES-256-GCM
- **Key derivation:** HKDF-SHA256 from `BUDDY_TOKEN` with context string `"buddy-encryption"` → 256-bit encryption key
- **IV:** 12 bytes, randomly generated per encryption operation
- **Storage format:** `base64(iv + ciphertext + tag)` in the `content` field
- **Decryption:** Only on explicit `get_node` — never in `list_nodes` or `search_nodes`
