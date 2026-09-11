#!/usr/bin/env node
/**
 * Applies Kill clone patches onto store.ts / terminal.tsx (idempotent).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const storePath = join(root, "src/lib/trench/store.ts");
const termPath = join(root, "src/components/trench/terminal.tsx");
const storePatch = join(root, "patches/kill-clone/store.ts.patch");
const termPatch = join(root, "patches/kill-clone/terminal.tsx.patch");

function hasKillClone(file) {
  try {
    return readFileSync(file, "utf8").includes("killClone:");
  } catch {
    return false;
  }
}

function runPatch(patchFile) {
  execFileSync("patch", ["-p1", "--forward", "--batch", "-i", patchFile], {
    cwd: root,
    stdio: "inherit",
  });
}

if (!existsSync(storePatch) || !existsSync(termPatch)) {
  console.error("[kill-clone] missing patch files");
  process.exit(1);
}

if (hasKillClone(storePath) && hasKillClone(termPath)) {
  console.log("[kill-clone] already applied");
  process.exit(0);
}

if (!hasKillClone(storePath)) {
  console.log("[kill-clone] patching store.ts");
  runPatch(storePatch);
}
if (!hasKillClone(termPath)) {
  console.log("[kill-clone] patching terminal.tsx");
  runPatch(termPatch);
}

if (!hasKillClone(storePath) || !hasKillClone(termPath)) {
  console.error("[kill-clone] patch did not land killClone");
  process.exit(1);
}
console.log("[kill-clone] patches applied");
