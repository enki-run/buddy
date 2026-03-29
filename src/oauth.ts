import { Hono } from "hono";
import type { Env } from "./types";
import { timingSafeEqual } from "./auth";

// OAuth 2.1 for single-user MCP server
// Uses BUDDY_TOKEN as the basis for all crypto operations
// Stateless: authorization codes are HMAC-signed timestamps
// PKCE (S256) is REQUIRED per OAuth 2.1

const OAUTH_CLIENT_ID = "buddy-mcp-client";
const CODE_EXPIRY_MS = 300_000; // 5 minutes

// --- Redirect URI validation ---
// Only allow localhost/loopback origins (MCP clients run locally)
function isAllowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    const hostname = url.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

// --- HMAC signing ---
async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Stateless authorization code: timestamp.sig ---
async function generateCode(secret: string): Promise<string> {
  const timestamp = Date.now().toString();
  const sig = await hmacSign(`code:${timestamp}`, secret);
  return `${timestamp}.${sig}`;
}

async function verifyCode(code: string, secret: string): Promise<boolean> {
  const parts = code.split(".");
  if (parts.length !== 2) return false;
  const [timestamp, sig] = parts;
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age > CODE_EXPIRY_MS || age < 0) return false;
  const expected = await hmacSign(`code:${timestamp}`, secret);
  return await timingSafeEqual(sig, expected);
}

// --- Authorize page HTML ---
function authorizePageHTML(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  error?: boolean;
}): string {
  const { redirectUri, state, codeChallenge, codeChallengeMethod, error } =
    params;
  const errorBlock = error
    ? '<div class="error">Ungültiger Token</div>'
    : "";
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>buddy — Authorize</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { background: #fff; border: 1px solid #e0e0e0; padding: 32px; border-radius: 8px; width: 340px; box-shadow: 0 12px 32px rgba(0,0,0,0.06); }
    h1 { font-family: 'JetBrains Mono', monospace; font-size: 18px; margin-bottom: 8px; }
    p { font-size: 13px; color: #666; margin-bottom: 20px; }
    input { width: 100%; padding: 9px 12px; border: 1px solid #e0e0e0; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 13px; margin-bottom: 14px; }
    input:focus { outline: none; border-color: #444; }
    button { width: 100%; padding: 9px; background: #111; color: #fff; border: none; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; }
    button:hover { background: #222; }
    .error { color: #904040; font-size: 12px; background: #fdf5f5; padding: 6px; border-radius: 6px; border: 1px solid #c08080; margin-bottom: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="box">
    <h1>buddy</h1>
    <p>MCP-Zugriff autorisieren</p>
    ${errorBlock}
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}">
      <input name="token" type="password" placeholder="Token eingeben..." autofocus autocomplete="current-password">
      <button type="submit">Autorisieren</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- OAuth sub-app ---
export function createOAuthRoutes() {
  const oauth = new Hono<{ Bindings: Env }>();

  // RFC 8414 — OAuth Authorization Server Metadata
  oauth.get("/.well-known/oauth-authorization-server", (c) => {
    const origin = new URL(c.req.url).origin;
    return c.json({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  // Dynamic Client Registration (MCP spec requires this)
  // SECURITY: Never return real tokens — client_secret is a placeholder.
  // Users authenticate via the /oauth/authorize form with their token.
  oauth.post("/oauth/register", async (c) => {
    const body = await c.req.json();
    return c.json(
      {
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_ID,
        client_name: body.client_name || "MCP Client",
        redirect_uris: body.redirect_uris || [],
      },
      201
    );
  });

  // Authorization endpoint — shows token-entry form, issues code
  oauth.get("/oauth/authorize", async (c) => {
    const redirectUri = c.req.query("redirect_uri");
    const state = c.req.query("state") ?? "";
    const codeChallenge = c.req.query("code_challenge") ?? "";
    const codeChallengeMethod = c.req.query("code_challenge_method") ?? "";

    if (!redirectUri) {
      return c.text("Missing redirect_uri", 400);
    }

    if (!isAllowedRedirectUri(redirectUri)) {
      return c.json(
        { error: "invalid_request", error_description: "redirect_uri must be localhost" },
        400
      );
    }

    // OAuth 2.1: PKCE S256 is REQUIRED
    if (!codeChallenge || codeChallengeMethod !== "S256") {
      return c.json(
        {
          error: "invalid_request",
          error_description:
            "PKCE is required. Provide code_challenge with code_challenge_method=S256",
        },
        400
      );
    }

    return c.html(
      authorizePageHTML({
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
      })
    );
  });

  oauth.post("/oauth/authorize", async (c) => {
    const body = await c.req.parseBody();
    const token = body["token"] as string;
    const redirectUri = body["redirect_uri"] as string;
    const state = body["state"] as string;
    const codeChallenge = body["code_challenge"] as string;
    const codeChallengeMethod = body["code_challenge_method"] as string;

    if (!isAllowedRedirectUri(redirectUri)) {
      return c.json(
        { error: "invalid_request", error_description: "redirect_uri must be localhost" },
        400
      );
    }

    // OAuth 2.1: PKCE S256 is REQUIRED
    if (!codeChallenge || codeChallengeMethod !== "S256") {
      return c.json(
        {
          error: "invalid_request",
          error_description:
            "PKCE is required. Provide code_challenge with code_challenge_method=S256",
        },
        400
      );
    }

    const tokenValid = await timingSafeEqual(token, c.env.BUDDY_TOKEN);
    if (!tokenValid) {
      return c.html(
        authorizePageHTML({
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          error: true,
        }),
        401
      );
    }

    // Generate authorization code (stateless, HMAC-signed)
    const code = await generateCode(c.env.BUDDY_TOKEN);

    // Embed code_challenge in the code: timestamp.sig:challenge
    const fullCode = `${code}:${codeChallenge}`;

    const url = new URL(redirectUri);
    url.searchParams.set("code", fullCode);
    if (state) url.searchParams.set("state", state);

    return c.redirect(url.toString());
  });

  // Token endpoint — exchanges code for access token
  oauth.post("/oauth/token", async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    let grantType: string;
    let code: string;
    let codeVerifier: string;

    if (contentType.includes("application/json")) {
      const body = await c.req.json();
      grantType = body.grant_type;
      code = body.code;
      codeVerifier = body.code_verifier;
    } else {
      const body = await c.req.parseBody();
      grantType = body["grant_type"] as string;
      code = body["code"] as string;
      codeVerifier = body["code_verifier"] as string;
    }

    if (grantType !== "authorization_code") {
      return c.json({ error: "unsupported_grant_type" }, 400);
    }

    if (!code) {
      return c.json(
        { error: "invalid_grant", error_description: "Missing code" },
        400
      );
    }

    // Extract code and code_challenge from format: timestamp.sig:challenge
    let actualCode = code;
    let storedChallenge = "";
    const colonIdx = code.lastIndexOf(":");
    if (colonIdx !== -1) {
      actualCode = code.substring(0, colonIdx);
      storedChallenge = code.substring(colonIdx + 1);
    }

    const valid = await verifyCode(actualCode, c.env.BUDDY_TOKEN);
    if (!valid) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Invalid or expired code",
        },
        400
      );
    }

    // OAuth 2.1: PKCE verification is REQUIRED
    if (!storedChallenge || !codeVerifier) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "PKCE code_verifier is required",
        },
        400
      );
    }

    // Verify PKCE S256: SHA256(code_verifier) base64url === stored challenge
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(codeVerifier)
    );
    const computed = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (computed !== storedChallenge) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "PKCE verification failed",
        },
        400
      );
    }

    return c.json({
      access_token: c.env.BUDDY_TOKEN,
      token_type: "Bearer",
      expires_in: 2592000, // 30 days
    });
  });

  return oauth;
}
