# Implementation Plan: Admin VIN typo correction

Date: 2026-08-04  
Spec: `docs/superpowers/specs/2026-08-04-admin-vin-edit-design.md`

## Goal

Admin can correct a mistyped VIN via the existing All Vehicles edit modal (confirm + retype), using an additive optional `vin` on `PATCH /api/admin/vehicles/:vin`, with no migration and no child-row changes.

## File map

| File | Change |
|------|--------|
| `backend/src/routes/admin.ts` | Optional `vin` on edit body; normalize; validate; duplicate check; update same row |
| `backend/src/routes/admin.vin-edit.test.ts` (new) | Automated rename safety tests (or extract pure helpers + unit tests if route tests need DB harness) |
| `frontend/src/stockyardLogic.js` | `renameVehicleVin(state, oldVin, newVin, patch)` re-key helper |
| `frontend/src/stockyardLogic.test.js` | Re-key + no-op + missing vehicle cases |
| `frontend/src/components/AllVehiclesTab.jsx` | Editable VIN; confirm dialog; send `vin` when changed; re-key state |
| `frontend/src/api.js` | No API shape change required (`adminUpdateVehicle` already forwards fields) |

## Steps

### 1. Backend rename logic in `PATCH /vehicles/:vin`

- Add `vin: z.string().trim().min(1).optional()` to `editVehicleBody`.
- After loading vehicle by path VIN:
  - If `body.vin` defined:
    - `newVin = body.vin.toUpperCase()` (or shared normalize).
    - If `newVin !== vin`:
      - If `!isValidVin(newVin)` → `400` `{ error: 'Invalid VIN format' }`.
      - Select other vehicle with `vehicles.vin = newVin`; if found → `409` `{ error: 'VIN already exists' }`.
      - Set `vehiclePatch.vin = newVin` and `vehiclePatch.vin_valid = true` (strict rename always marks valid).
- Keep all other field/status/flag behavior identical.
- Final select already returns `vehicles.vin` — will reflect new value.
- Catch unique-constraint race as `409` if Postgres unique violation surfaces.

**Verify:** `cd backend; npm test` (existing + new).

### 2. Backend tests (production-safety focused)

Prefer extracting a small pure function if full route+DB tests are heavy:

```ts
// e.g. prepareVinRename(currentVin, requestedVin, existingOwnerId?)
```

Minimum cases:

1. Same VIN after normalize → no rename fields.
2. Invalid → error result.
3. Duplicate → error result.
4. Valid free VIN → `{ vin, vin_valid: true }`.

If integration harness exists/easy: assert `vehicle_id` stable and `scans.vin_raw` unchanged. Otherwise cover that in manual checklist.

**Verify:** failing tests first optional; then green.

### 3. Frontend state re-key

Add `renameVehicleVin(state, oldVin, newVin, patch = {})`:

- Normalize both.
- If old missing → return state.
- If new === old → delegate to `updateVehicleDetails`.
- Copy vehicle to new key with `{ ...existing, ...patch, vin: newVin, vinValid: true }`; delete old key.
- Remap `flags` / `scans` entries whose `vin` === old → new (so client lists stay consistent).

**Verify:** `cd frontend; npm test`.

### 4. All Vehicles edit UI

- Form field `vin` initialized from `editingVin`.
- Header can still show editing context; input is the editable VIN.
- On save:
  - Validate yard-when-IN (existing).
  - Normalize form VIN; if invalid → setError, no API.
  - If VIN changed → open confirm UI (inline second step or overlay): show OLD → NEW; input to retype NEW; Confirm disabled until normalize(retype) === newVin.
  - PATCH via `adminUpdateVehicle(editingVin /* old */, { ..., vin: newVin })` only include `vin` when changed.
  - On success: `setState(renameVehicleVin(...))`; set `editingVin` to new VIN; success message.
  - Map `409` / `400` messages clearly.

Match existing modal CSS patterns; minimal new styles.

**Verify:** manual local smoke (below).

### 5. Local heavy verification (required before any ship)

Per `.local/cli-hosts.md`:

```powershell
cd backend; npm run dev
cd frontend; npm run dev
```

Login admin `ADMIN123`.

Checklist:

1. Non-VIN edit still works.
2. Invalid VIN blocked client + (if forced) server; DB unchanged.
3. Duplicate VIN → error; no merge.
4. Typo-fix free valid VIN → confirm retype → success.
5. History/flags/status/yard/damage still on vehicle under new VIN.
6. Scan IN/OUT with new VIN hits same vehicle.
7. Old VIN 404 / not in list.
8. Yard/delivery users cannot hit admin rename (403).

Optional DB spot-check: same `vehicles.id` before/after; `scans` rows still on that `id`; `vin_raw` unchanged.

### 6. Done criteria

- [ ] Spec behaviors implemented
- [ ] Backend + frontend tests green
- [ ] Manual checklist passed on local
- [ ] No migration files added
- [ ] No production deploy unless user explicitly asks to ship

## Out of scope (do not implement)

- Merge when target VIN exists
- Rewrite `scans.vin_raw`
- Audit table
- Non-admin VIN edit
