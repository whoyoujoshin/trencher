#!/usr/bin/env node
/**
 * DigitalOcean / Docker entry. Migrate if DATABASE_URL is set, then serve
 * the Nitro node-server bundle on 0.0.0.0:PORT (default 8080).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(root, ".output", "server", "index.mjs");

process.env.HOST ||= "0.0.0.0";
process.env.PORT ||= "8080";
process.env.NITRO_HOST ||= process.env.HOST;
process.env.NITRO_PORT ||= process.env.PORT;

if (!existsSync(server)) {
  console.error(
    "[start] missing .output/server/index.mjs. Build with NITRO_PRESET=node-server.",
  );
  process.exit(1);
}

const migrate = spawnSync(process.execPath, [join(root, "scripts", "migrate.mjs")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
if (migrate.status) process.exit(migrate.status);

await import(pathToFileURL(server).href);
