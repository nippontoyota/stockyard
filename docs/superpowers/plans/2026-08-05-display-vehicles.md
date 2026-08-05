# Display Vehicles Implementation Plan

> **For agentic workers:** Implement task-by-task with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add display OUT tracking, visibility, returns, availability gates, and Excel fields without mutating existing data.

**Architecture:** Extend the existing scan pipeline. Display OUT creates an OUT audit event while retaining active status IN with nullable display metadata on `vehicle_status`. Same-yard IN gets a narrow return-from-display exception; all other existing transitions remain unchanged.

**Tech Stack:** Express 5, TypeScript, Drizzle ORM/PostgreSQL, Zod, React, Vite, Vitest, SheetJS.

## Global Constraints

- Add nullable columns only; do not rename/drop/change existing columns or backfill existing rows.
- Do not run `db:push`, migrations, seed, clear, drop, or any database-writing command.
- Treat `on_display = NULL` as false.
- Display cars remain in IN/capacity/dwell totals but are unavailable for OUT and requisitions.
- Only future explicit display/return/override actions may alter display fields on the selected vehicle.
- Do not commit unless separately requested.

---

### Task 1: Shared data model and scan state

**Files:**
- Modify: `backend/src/db/schema.ts`
- Modify: `frontend/src/stockyardLogic.js`
- Test: `frontend/src/stockyardLogic.test.js`

**Interfaces:**
- `createScan({ ..., displayTakenBy, displayLocation })`
- Vehicle fields: `onDisplay`, `displayTakenBy`, `displayLocation`
- Database fields: `on_display`, `display_taken_by`, `display_location`

- [ ] Add nullable display columns to `scans` and `vehicle_status`.
- [ ] Add failing state tests: display OUT stays IN; another OUT is rejected; same-yard IN clears display; ordinary same-yard IN remains rejected.
- [ ] Extend `createScan` and `applyScan` with the display fields and transitions.
- [ ] Run `npm test -- stockyardLogic.test.js` in `frontend`; expect PASS.

### Task 2: Backend scan validation and transitions

**Files:**
- Modify: `backend/src/routes/scans.ts`
- Test: existing/new scan route tests under `backend/src`

**Interfaces:**
- OUT accepts `out_remark: 'display'`
- Display requires `display_taken_by` and `display_location`
- Same-yard IN returns only when `on_display === true`

- [ ] Extend OUT Zod schemas and bulk-sync payload validation.
- [ ] Select active display fields with current status.
- [ ] Persist display metadata on the scan event.
- [ ] For display OUT, retain IN/current yard and set active display fields.
- [ ] Reject any OUT while already displayed with “Return vehicle from display first.”
- [ ] Move the return-from-display branch before the existing same-yard IN rejection; clear active fields only on accepted return.
- [ ] Add route/unit coverage where the repository’s current test seams allow it.
- [ ] Run backend tests; expect PASS without a database connection/write.

### Task 3: Vehicle API and availability gates

**Files:**
- Modify: `backend/src/routes/vehicles.ts`
- Modify: `backend/src/routes/requisitions.ts`
- Modify: `backend/src/routes/yards.ts`
- Modify: `backend/src/routes/admin.ts`

**Interfaces:**
- Vehicle responses expose `on_display`, `display_taken_by`, `display_location`
- Requisition and available-stock queries exclude/reject `on_display = true`, while NULL remains available

- [ ] Add display columns to vehicle list/detail selects.
- [ ] Reject requisition creation for a displayed vehicle.
- [ ] Exclude displayed vehicles from available yard stock using `on_display IS DISTINCT FROM true` semantics.
- [ ] Clear active display fields when an admin explicitly forces status away from display-IN.
- [ ] Run TypeScript build; expect PASS.

### Task 4: Frontend serialization and hydration

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Bulk OUT payload maps `displayTakenBy` to `display_taken_by`
- Bulk OUT payload maps `displayLocation` to `display_location`
- Server vehicle rows map nullable display fields into client objects

- [ ] Serialize display fields for OUT sync.
- [ ] Hydrate `onDisplay`, `displayTakenBy`, and `displayLocation`.
- [ ] Add display form state, validation, payload, reset, and confirmation details to QR and manual OUT flows.
- [ ] Disable normal OUT choices when the selected vehicle is displayed and guide users to return it.

### Task 5: Admin and worker display views

**Files:**
- Modify: `frontend/src/components/YardVehiclesModal.jsx`
- Modify: `frontend/src/components/AllVehiclesTab.jsx`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Filter values: `all`, `in`, `display`, `out`
- Return button emits a normal manual-entry IN scan through existing create/apply/bulk-sync flow

- [ ] Add Display reason and required free-text fields to `AdminOutForm`.
- [ ] Add On display filtering, badge, responsible person, location, and individual Return to yard action to the admin yard modal.
- [ ] Add equivalent scoped visibility and return action for stockyard workers.
- [ ] Require return confirmation, disable while syncing, and preserve display state until success.
- [ ] Show On display badge in general vehicle views.
- [ ] Add minimal styles using existing badge/modal conventions.

### Task 6: Timeline and Excel

**Files:**
- Modify: `frontend/src/components/VehicleTimeline.jsx`
- Modify: `frontend/src/exportStockExcel.js`

**Interfaces:**
- Excel columns: `On Display`, `Taken By`, `Display Location`

- [ ] Humanize display timeline entries and show responsible person/location.
- [ ] Add display columns to every vehicle export row; use blanks for non-display/legacy rows.
- [ ] Confirm yard export continues using all yard vehicles regardless of active filter.

### Task 7: Non-mutating verification

**Files:**
- Verify all modified files

- [ ] Search for remaining two-reason enums/dropdowns and plain-IN availability assumptions.
- [ ] Run frontend unit tests and build.
- [ ] Run backend unit tests and TypeScript build only if they do not connect to a database.
- [ ] Read IDE diagnostics for modified files.
- [ ] Review diff for accidental secrets, generated files, schema defaults/constraints, backfills, and database-writing scripts.
- [ ] Confirm no database command ran and no existing data was modified.
