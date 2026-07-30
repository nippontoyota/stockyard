# Hardcoded stockyard yards list

**Date:** 2026-07-30  
**Status:** Approved

## Problem

After logout then login, the stockyard location dropdown sometimes shows only one yard — the yard from the previous session.

Root cause: logged-in stockyard users get a filtered `/api/yards` response (their yard only). That list is cached in `localStorage` (`cache:yards`) and written into the module `yards` via `setConfig`. Logout clears session only, not the cache or module list.

## Solution

Hardcode the full static yard list on the frontend. Stop fetching yards on app mount.

### Changes

1. **`frontend/src/stockyardLogic.js`** — Initialize `yards` with the full seed list (`YARD_DATA` from `backend/src/db/seed.ts`). Keep `setConfig` able to update branches; do not overwrite yards from API with a shorter filtered list (or stop passing yards into `setConfig` from mount).

2. **`frontend/src/main.jsx`** — On mount, fetch only `getBranches()`; call `setConfig` with branches only (or pass existing yards unchanged). Do not call `getYards()`.

3. **`frontend/src/api.js`** — Leave `getYards` unused by login/config path (or remove cache usage). No requirement to delete the function if unused elsewhere later.

### Out of scope

- Hardcoding delivery branches
- Backend `/api/yards` behavior
- Auth / password changes

## Success criteria

- Login stockyard dropdown always lists all seeded yards after logout/login.
- No dependency on `cache:yards` for the login selector.
