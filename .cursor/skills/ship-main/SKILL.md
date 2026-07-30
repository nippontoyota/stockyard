---
name: ship-main
description: >-
  Rebase changes to main and make sure that render and cloudflare through
  wrangler is redeployed. Use when the user says that phrase, or asks to ship,
  push to main, redeploy Render, or deploy Cloudflare Pages via Wrangler for
  this stockyard project.
---

# Ship to main + redeploy

User intent (verbatim): **rebase changes to main and make sure that render and cloudflare through wrangler is redeployed**

Do this end-to-end. Do not stop after push. Do not ask whether to deploy unless blocked (auth failure, merge conflict, secrets).

## Project facts

| Target | Detail |
|--------|--------|
| Deploy branch | `main` (push here; do not use `sajad` even if it is GitHub default) |
| Backend (Render) | Auto-deploys on `git push origin main` → `https://stockyard-00s6.onrender.com` |
| Frontend (Cloudflare Pages) | Project `nippon-yard-scan` via Wrangler from `frontend/dist` |
| Pages URL | `https://nippon-yard-scan.pages.dev` |
| Health | `curl.exe -fsS https://stockyard-00s6.onrender.com/health` |

## Workflow

Copy and track:

```
Ship:
- [ ] 1. Sync + land on main
- [ ] 2. Commit if dirty
- [ ] 3. Push main (Render)
- [ ] 4. Build + Wrangler deploy (Cloudflare)
- [ ] 5. Verify
```

### 1. Sync + land on main

From repo root:

```powershell
git fetch origin
git status
git branch --show-current
```

Then:

- **Already on `main` with local commits/uncommitted work:** `git pull --rebase origin main`
- **On another branch with commits to ship:**  
  `git rebase origin/main` (on that branch) → `git checkout main` → `git pull --rebase origin main` → `git merge --ff-only <branch>`  
  If ff-only fails, rebase the branch onto main again, then ff-merge.
- **Uncommitted work on another branch:** stash or commit on that branch first, then rebase onto main as above.
- **Conflicts:** stop, show conflicted files, do not force-push.

Never `push --force` to `main`.

### 2. Commit if dirty

If there are staged/unstaged/untracked files that belong in this ship:

1. Follow the repo commit protocol (status, diff, log style).
2. Commit with a concise message focused on why.
3. Do **not** commit secrets (`.env`, credentials).
4. Skip unrelated untracked junk unless the user asked to include it.

If working tree is clean and `main` is ahead of `origin/main`, skip to push.

### 3. Push main (Render)

```powershell
git push origin main
```

That is the Render redeploy trigger. No Render CLI/API key is required.

If only frontend files changed, still push — Render may no-op rebuild; that is fine.

### 4. Build + Wrangler (Cloudflare)

Prefer the helper (from repo root):

```powershell
node .cursor/skills/ship-main/scripts/ship.mjs --cloudflare-only
```

Or manually:

```powershell
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=nippon-yard-scan --commit-dirty=true
cd ..
```

Require a successful deploy URL in the Wrangler output (e.g. `https://<hash>.nippon-yard-scan.pages.dev`).

If Wrangler auth fails: tell the user to run `npx wrangler login` and stop.

### 5. Verify

```powershell
curl.exe -fsS --max-time 30 https://stockyard-00s6.onrender.com/health
curl.exe -sI --max-time 20 https://nippon-yard-scan.pages.dev
```

Report back in 3–5 lines:

- Commit SHA on `main`
- Render: push done + health body (or “warming up” if timeout)
- Cloudflare: preview URL from Wrangler + pages.dev HTTP status

## One-shot helper

After commits are ready on `main` (or you want the script to push current `main` + deploy CF):

```powershell
node .cursor/skills/ship-main/scripts/ship.mjs
```

Flags:

- `--cloudflare-only` — skip git push; only build + Wrangler
- `--push-only` — skip Cloudflare; only `git push origin main`
- `--no-push` — build + Wrangler only (alias of `--cloudflare-only`)

The agent still owns commit/rebase decisions; the script owns push + CF deploy mechanics.

## Do not

- Deploy from `sajad` or open a PR instead of shipping to `main` unless the user said so
- Amend already-pushed commits
- Skip Wrangler because “Render covers frontend” (it does not)
- Skip push because “frontend-only” (still push `main` when asked to redeploy Render)
