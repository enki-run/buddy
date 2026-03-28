import { readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function setup({ provide }: { provide: (key: string, value: unknown) => void }) {
  const migrations = await readD1Migrations(
    path.join(__dirname, "..", "migrations")
  );
  provide("d1Migrations", migrations);
}
