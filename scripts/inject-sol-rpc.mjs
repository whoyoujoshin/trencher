#!/usr/bin/env node
/**
 * Prefer a private Solana RPC in the Nitro bundle before serve.
 * Public mainnet/publicnode/ankr often HTTP 403 from DigitalOcean cloud IPs.
 * Set SOLANA_RPC_URL (full URL) or HELIUS_API_KEY on the app (Run time).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_PRIMARY = "https://api.mainnet-beta.solana.com";

function resolveRpc() {
  const direct = String(process.env.SOLANA_RPC_URL ?? "").trim();
  if (direct) return direct;
  const helius = String(process.env.HELIUS_API_KEY ?? "").trim();
  if (helius) return `https://mainnet.helius-rpc.com/?api-key=${helius}`;
  return null;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(mjs|js|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".output");
const rpc = resolveRpc();

if (!rpc) {
  console.log("[sol-rpc] no SOLANA_RPC_URL / HELIUS_API_KEY — public RPCs unchanged");
  process.exit(0);
}

if (rpc === PUBLIC_PRIMARY) {
  console.log("[sol-rpc] SOLANA_RPC_URL is already the public primary — skip");
  process.exit(0);
}

let files = 0;
let hits = 0;
try {
  for (const file of walk(outDir)) {
    const before = readFileSync(file, "utf8");
    if (!before.includes(PUBLIC_PRIMARY)) continue;
    const after = before.split(PUBLIC_PRIMARY).join(rpc);
    if (after === before) continue;
    writeFileSync(file, after);
    files += 1;
    hits += (before.length - after.length) === 0 ? 1 : before.split(PUBLIC_PRIMARY).length - 1;
  }
} catch (e) {
  console.error("[sol-rpc] inject failed:", e instanceof Error ? e.message : e);
  process.exit(0); // don't block boot
}

console.log(`[sol-rpc] injected private RPC into ${files} file(s) (${hits} replacement(s))`);
