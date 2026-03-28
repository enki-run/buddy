import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:test";
import { inject, beforeAll } from "vitest";

beforeAll(async () => {
  const migrations = inject("d1Migrations");
  await applyD1Migrations(env.DB, migrations);
});
