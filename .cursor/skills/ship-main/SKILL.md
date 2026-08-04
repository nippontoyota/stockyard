---
name: ship-main
description: >-
  Rebase changes to main and redeploy Render (API) plus Vercel (frontend).
  Use when the user says that phrase, or asks to ship, push to main, or
  redeploy Render / Vercel for this stockyard project.
---

# Ship to main + redeploy

User intent: land changes on `main` and redeploy production.

## Project facts

| Target | Detail |
|--------|--------|
| Deploy branch | `main` (GitHub default + Render/Vercel production branch) |
| Backend (Render) | Auto-deploys on `git push origin main` → `https://stockyard-api-xvaa.onrender.com` |
| Frontend (Vercel) | Project `stockyard` (team `nippontoyotas-projects`) → `https://stockyard-phi.vercel.app` |
| Health | `curl.exe -fsS https://stockyard-api-xvaa.onrender.com/health` |
| Ready | `curl.exe -fsS https://stockyard-api-xvaa.onrender.com/ready` |

## Workflow

```
Ship:
- [ ] 1. Sync + land on main
- [ ] 2. Commit if dirty
- [ ] 3. Push main (Render)
- [ ] 4. Deploy Vercel production
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

That is the Render redeploy trigger.

### 4. Deploy Vercel production

From repo root (uses root `vercel.json`):

```powershell
npx vercel --prod --yes --scope nippontoyotas-projects --project stockyard
```

Require alias to `https://stockyard-phi.vercel.app`.

### 5. Verify

```powershell
curl.exe -fsS --max-time 30 https://stockyard-api-xvaa.onrender.com/health
curl.exe -fsS --max-time 30 https://stockyard-api-xvaa.onrender.com/ready
curl.exe -sI --max-time 20 https://stockyard-phi.vercel.app
```

Report back in 3–5 lines:

- Commit SHA on `main`
- Render: push done + health/ready body (or “warming up” if timeout)
- Vercel: production URL / alias status

## One-shot helper

```powershell
node .cursor/skills/ship-main/scripts/ship.mjs
```

Flags:

- `--vercel-only` — skip git push; only Vercel production deploy
- `--push-only` — skip Vercel; only `git push origin main`
- `--no-push` — alias of `--vercel-only`

The agent still owns commit/rebase decisions; the script owns push + Vercel deploy mechanics.

## Do not

- Force-push `main`
- Amend already-pushed commits
- Skip Vercel because “Render covers frontend” (it does not)
- Skip push because “frontend-only” (still push `main` when asked to redeploy Render)
