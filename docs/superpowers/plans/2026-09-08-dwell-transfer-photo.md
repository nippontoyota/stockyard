# Dwell-Time Transfer Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow Stockyard Transfer OUT scans for vehicles with dwell-time flags without requiring an unrelated photo.

**Architecture:** Keep the existing scan form and scan state flow unchanged except for removing the generic active-flag photo gate. Resolve matching dwell flags inside the existing scan transaction for ordinary OUT/IN lifecycle changes, and clean up legacy flags in the existing background dwell checker. No new request path or database schema is needed.

**Tech Stack:** React 19, Vite, plain JavaScript logic tests with Node.

## Global Constraints

- Do not add requests, re-fetches, persistence writes, or state fields.
- Do not mutate existing vehicle, flag, scan, or queue records.
- Preserve transfer-field validation and damage remark/photo validation.
- Preserve existing flag display and scan result behavior.

---

### Task 1: Add the regression case

**Files:**
- Modify: `frontend/src/stockyardLogic.test.js`

**Interfaces:**
- Consumes: `applyScan`, `createInitialState`, and `baseScan` already defined in the test file.
- Produces: coverage proving an active `dwell_exceeded` flag does not make a valid stockyard transfer state transition fail.

- [ ] Add a test state containing an IN vehicle and an unresolved `dwell_exceeded` flag for the same VIN, apply a valid `stockyard_transfer` OUT scan, and assert `accepted === true`, `currentStatus === "transit"`, and the flag remains present.
- [ ] Run `npm.cmd test` from `frontend` and confirm the test suite passes before the implementation change.

### Task 2: Remove only the accidental photo gate

**Files:**
- Modify: `frontend/src/main.jsx:1216-1218` and the matching active-flag notice near the scan form damage controls.
- Modify: `frontend/src/stockyardLogic.js` and `frontend/src/stockyardLogic.test.js` for immediate local dwell-flag lifecycle state.
- Modify: `backend/src/routes/scans.ts` to resolve dwell flags in the existing IN/OUT transaction.
- Modify: `backend/src/lib/dwellCheck.ts` to clean up legacy flags for vehicles no longer IN.

**Interfaces:**
- Consumes: Existing `damaged`, `damageRemark`, and `damageImage` form state.
- Produces: The existing `doSubmit` flow with generic flag validation removed and damage-specific validation unchanged.

- [ ] Delete the `isFlagged && !damageImage` rejection from `submit`.
- [ ] Delete the notice that says every active flag requires a photo.
- [ ] Leave the `damaged` branch requiring both a non-empty damage remark and `damageImage` unchanged.
- [ ] Leave scan construction, `applyScan`, `bulkSync`, offline queuing, flags, and server payloads unchanged.
- [ ] Resolve only unresolved `dwell_exceeded` flags when accepted ordinary OUT/IN changes the vehicle dwell cycle; preserve them for Display OUT/display-return IN.
- [ ] Resolve legacy dwell flags for vehicles whose current status is no longer `in` during the existing periodic checker.

### Task 3: Verify behavior and build

**Files:**
- Inspect: `frontend/src/main.jsx`, `frontend/src/stockyardLogic.test.js`

**Interfaces:**
- Consumes: The completed client validation and regression test.
- Produces: Fresh test/build evidence and a diff limited to the requested behavior.

- [ ] Run `npm.cmd test` and `npm.cmd run build` from `frontend`.
- [ ] Run `npm.cmd test` and `npm.cmd run build` from `backend`.
- [ ] Inspect `git diff --check` and `git diff --stat`; confirm no backend, schema, queue, or unrelated files changed.
