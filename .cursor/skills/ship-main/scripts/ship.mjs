#!/usr/bin/env node
/**
 * Ship helper for stockyard:
 * - push origin main (triggers Render)
 * - build frontend + wrangler pages deploy (Cloudflare)
 *
 * Usage (repo root):
 *   node .cursor/skills/ship-main/scripts/ship.mjs
 *   node .cursor/skills/ship-main/scripts/ship.mjs --cloudflare-only
 *   node .cursor/skills/ship-main/scripts/ship.mjs --push-only
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const FRONTEND = join(REPO_ROOT, "frontend");
const CF_PROJECT = "nippon-yard-scan";
const RENDER_READY = "https://stockyard-api-xvaa.onrender.com/ready";
const VERCEL_URL = "https://stockyard-phi.vercel.app";
const PAGES_URL = "https://nippon-yard-scan.pages.dev";
const SMOKE_SCRIPT = join(REPO_ROOT, ".github/scripts/smoke-prod.sh");

const args = new Set(process.argv.slice(2));
const cloudflareOnly = args.has("--cloudflare-only") || args.has("--no-push");
const pushOnly = args.has("--push-only");

function run(cmd, cmdArgs, opts = {}) {
  const cwd = opts.cwd || REPO_ROOT;
  console.log(`\n> ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: opts.env || process.env,
  });
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${cmdArgs.join(" ")}`);
  }
}

function runCapture(cmd, cmdArgs, opts = {}) {
  const cwd = opts.cwd || REPO_ROOT;
  const r = spawnSync(cmd, cmdArgs, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(
      `Command failed (${r.status}): ${cmd} ${cmdArgs.join(" ")}\n${r.stderr || r.stdout || ""}`,
    );
  }
  return (r.stdout || "").trim();
}

function assertMain() {
  const branch = runCapture("git", ["branch", "--show-current"]);
  if (branch !== "main") {
    throw new Error(`Must be on main (currently on '${branch}'). Rebase/checkout first.`);
  }
}

function pushMain() {
  assertMain();
  const status = runCapture("git", ["status", "--porcelain"]);
  if (status) {
    throw new Error(
      "Working tree dirty. Commit (or stash) before push.\n" + status,
    );
  }
  run("git", ["push", "origin", "main"]);
  console.log("Render: push to origin/main complete (auto-deploy if connected).");
}

function deployCloudflare() {
  if (!existsSync(join(FRONTEND, "package.json"))) {
    throw new Error(`frontend/ not found at ${FRONTEND}`);
  }
  run("npm", ["run", "build"], { cwd: FRONTEND });
  run(
    "npx",
    [
      "wrangler",
      "pages",
      "deploy",
      "dist",
      "--project-name=" + CF_PROJECT,
      "--commit-dirty=true",
    ],
    { cwd: FRONTEND },
  );
}

function verify() {
  console.log("\n--- verify ---");
  if (existsSync(SMOKE_SCRIPT) && process.platform !== "win32") {
    run("bash", [SMOKE_SCRIPT], {
      env: {
        ...process.env,
        SMOKE_API_BASE: "https://stockyard-api-xvaa.onrender.com",
        SMOKE_FRONTEND_URL: VERCEL_URL,
        SMOKE_RETRIES: "4",
        SMOKE_RETRY_SLEEP: "10",
      },
    });
    return;
  }
  // Windows / fallback: curl the critical paths without bash
  const curl = process.platform === "win32" ? "curl.exe" : "curl";
  try {
    run(curl, ["-fsS", "--max-time", "30", RENDER_READY]);
  } catch {
    console.warn("Render /ready check failed or timed out (service may be deploying).");
  }
  try {
    run(curl, ["-sI", "--max-time", "20", VERCEL_URL]);
  } catch {
    console.warn("Vercel HEAD check failed.");
  }
  try {
    run(curl, ["-sI", "--max-time", "20", PAGES_URL]);
  } catch {
    console.warn("Pages HEAD check failed.");
  }
}

function main() {
  process.chdir(REPO_ROOT);
  console.log(`Repo: ${REPO_ROOT}`);

  if (!cloudflareOnly) pushMain();
  if (!pushOnly) deployCloudflare();
  verify();

  const sha = runCapture("git", ["rev-parse", "--short", "HEAD"]);
  console.log(`\nDone. HEAD ${sha}`);
  console.log(`Render ready: ${RENDER_READY}`);
  console.log(`Vercel: ${VERCEL_URL}`);
  console.log(`Cloudflare: ${PAGES_URL}`);
}

try {
  main();
} catch (err) {
  console.error(`\nship failed: ${err.message}`);
  process.exit(1);
}
