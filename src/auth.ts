import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { Env } from "./types";
import { VERSION } from "./types";
import { ActivityService } from "./services/activity";

// --- Public paths (no auth required) ---
// Exact matches: only these paths, no sub-paths
const PUBLIC_EXACT = new Set(["/health", "/login"]);
// Prefix matches: these paths and all sub-paths (needed for OAuth flow)
const PUBLIC_PREFIX = ["/oauth", "/.well-known/oauth-authorization-server"];

function isPublicPath(path: string): boolean {
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIX.some((p) => path === p || path.startsWith(p + "/"));
}

// --- IP hashing for audit trail ---
async function hashIP(ip: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip)
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

// --- Timing-safe comparison via HMAC ---
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  // Pad to same length to avoid leaking length information
  const maxLen = Math.max(bufA.length, bufB.length);
  const paddedA = new Uint8Array(maxLen);
  const paddedB = new Uint8Array(maxLen);
  paddedA.set(bufA);
  paddedB.set(bufB);

  const keyA = await crypto.subtle.importKey(
    "raw",
    paddedA,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const keyB = await crypto.subtle.importKey(
    "raw",
    paddedB,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const dummy = new Uint8Array(32);
  const sigA = await crypto.subtle.sign("HMAC", keyA, dummy);
  const sigB = await crypto.subtle.sign("HMAC", keyB, dummy);

  const viewA = new Uint8Array(sigA);
  const viewB = new Uint8Array(sigB);
  let result = 0;
  for (let i = 0; i < viewA.length; i++) {
    result |= viewA[i] ^ viewB[i];
  }
  return bufA.length === bufB.length && result === 0;
}

// --- CSRF tokens (HMAC-SHA256 signed nonce:timestamp, 10 min validity) ---
export async function generateCsrfToken(secret: string): Promise<string> {
  const nonceBytes = new Uint8Array(8);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const timestamp = Date.now().toString();
  const payload = `${nonce}:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${payload}.${hex}`;
}

export async function validateCsrfToken(
  token: string,
  secret: string
): Promise<boolean> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return false;
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);

  // Extract timestamp from payload (nonce:timestamp)
  const colonIdx = payload.indexOf(":");
  if (colonIdx === -1) return false;
  const timestamp = payload.substring(colonIdx + 1);
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age > 600_000 || age < 0) return false; // max 10 min

  // Re-generate expected signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedSig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return await timingSafeEqual(sig, expectedHex);
}

// --- Helper: generate short random session ID ---
function randomSessionId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Auth middleware ---
let tokenLengthWarned = false;

export const authMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const token = c.env.BUDDY_TOKEN;

    // Token length warning (once per isolate)
    if (!tokenLengthWarned) {
      tokenLengthWarned = true;
      if (token.length < 32) {
        console.warn(
          `[buddy] WARNING: BUDDY_TOKEN is only ${token.length} chars — use at least 32 for security`
        );
      }
    }

    // X-Buddy-Version header on all responses
    c.header("X-Buddy-Version", VERSION);

    const path = c.req.path;

    // Public paths — pass through
    if (isPublicPath(path)) {
      return next();
    }

    const activity = new ActivityService(c.env.DB);
    const clientIP = c.req.header("cf-connecting-ip") ?? "unknown";
    const ipHash = clientIP !== "unknown" ? await hashIP(clientIP) : undefined;

    // --- MCP path: Bearer token auth ---
    if (path === "/mcp") {
      const authHeader = c.req.header("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const bearerToken = authHeader.slice(7);

        // Check current token
        if (await timingSafeEqual(bearerToken, token)) {
          return next();
        }

        // Check previous token for rotation
        if (
          c.env.BUDDY_TOKEN_PREVIOUS &&
          (await timingSafeEqual(bearerToken, c.env.BUDDY_TOKEN_PREVIOUS))
        ) {
          return next();
        }

        // Invalid token
        await activity.log({
          action: "auth_invalid_token",
          entity_type: "session",
          entity_id: randomSessionId(),
          summary: "Invalid Bearer token on /mcp",
          ip_hash: ipHash,
        });
        return c.json({ error: "Unauthorized" }, 401);
      }

      // No Bearer header at all
      return c.json({ error: "Unauthorized" }, 401);
    }

    // --- Dashboard paths: Cookie session auth ---
    const cookie = getCookie(c, "buddy_session");
    if (cookie) {
      if (await timingSafeEqual(cookie, token)) {
        return next();
      }

      // Check previous token for rotation
      if (
        c.env.BUDDY_TOKEN_PREVIOUS &&
        (await timingSafeEqual(cookie, c.env.BUDDY_TOKEN_PREVIOUS))
      ) {
        return next();
      }
    }

    // No valid auth — redirect HTML clients to login, return 401 for APIs
    const accept = c.req.header("Accept") ?? "";
    if (accept.includes("text/html")) {
      return c.redirect("/login");
    }
    return c.json({ error: "Unauthorized" }, 401);
  }
);

// --- Login handler helpers ---

export async function handleLoginSuccess(
  activity: ActivityService,
  ipHash: string | undefined
): Promise<void> {
  await activity.log({
    action: "auth_login",
    entity_type: "session",
    entity_id: randomSessionId(),
    summary: "Successful login",
    ip_hash: ipHash,
  });
}

export async function handleLoginFailure(
  activity: ActivityService,
  ipHash: string | undefined
): Promise<void> {
  await activity.log({
    action: "auth_failed",
    entity_type: "session",
    entity_id: randomSessionId(),
    summary: "Failed login attempt",
    ip_hash: ipHash,
  });
}

export async function handleLogout(
  activity: ActivityService,
  ipHash: string | undefined
): Promise<void> {
  await activity.log({
    action: "auth_logout",
    entity_type: "session",
    entity_id: randomSessionId(),
    summary: "Logout",
    ip_hash: ipHash,
  });
}

export { hashIP, timingSafeEqual };
