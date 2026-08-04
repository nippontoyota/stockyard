# Design: Admin VIN typo correction

Date: 2026-08-04  
Status: approved (pending implementation)

## Goal

Let admins correct a mistyped VIN on an existing vehicle without deleting/recreating the row and without losing scans, flags, status, requisitions, or damage photos.

## Decisions

| Topic | Choice |
|-------|--------|
| Use case | Typo fix only (same vehicle, rename VIN) |
| Conflict when new VIN exists | Reject `409` — no merge, no overwrite |
| Validation | Strict — must pass `isValidVin` (17 chars, no I/O/Q) |
| UX | Editable VIN in existing All Vehicles edit modal; confirm + retype new VIN when changed |
| API shape | Extend existing `PATCH /api/admin/vehicles/:vin` with optional `vin` |
| Schema / migration | None |
| Child rows | Untouched — all FKs use `vehicle_id` |
| `scans.vin_raw` | Leave as historical scan text (do not rewrite) |
| Audit table | Out of scope |
| Roles | Admin only (existing `/api/admin` gate) |

## Production safety invariants

1. No database migration.
2. No deletes or recreates as part of rename.
3. At most one row updated: `vehicles.vin` (+ `vin_valid = true`) for the matched vehicle.
4. Omitting `vin` in the PATCH body preserves today’s edit behavior exactly.
5. Duplicate target VIN never updates either row.
6. Invalid format never updates the row.
7. Non-admin callers remain forbidden.
8. Local automated + manual checklist must pass before any deploy to production.

## Data model (unchanged)

- `vehicles.id` (uuid) is the primary key.
- `vehicles.vin` is unique natural key.
- `scans`, `flags`, `vehicle_status`, `requisitions` (and damage fields on scans) reference `vehicle_id`, not `vin`.

Therefore renaming `vehicles.vin` does not orphan history.

## API

**Endpoint:** `PATCH /api/admin/vehicles/:vin` (admin only)

**Path param:** current VIN (lookup key).

**Body:** existing `editVehicleBody` fields, plus optional:

```ts
vin?: string  // new VIN when correcting a typo
```

**When `vin` is omitted:** behave exactly as today (model, drive_type, key_no, status, yard_id, vin_valid).

**When `vin` is present:**

1. Normalize (uppercase / trim — same helpers as elsewhere).
2. If normalized value equals current VIN → skip rename (still apply other fields).
3. If `!isValidVin(normalized)` → `400`, no DB write for the rename.
4. If another vehicle already has that VIN → `409`, no DB write.
5. Else `UPDATE vehicles SET vin = normalized, vin_valid = true WHERE vin = current` (same row / same `id`).
6. Apply any other body fields in the same request as today.
7. Return the updated vehicle payload including the new `vin`.

**Errors:**

| Case | Status |
|------|--------|
| Invalid VIN format | `400` |
| Target VIN already taken | `409` |
| Current VIN not found | existing not-found behavior |
| Non-admin | `403` |

## UI

**Surface:** Admin → All Vehicles → existing edit modal only.

**VIN control:**

- Editable input pre-filled with current VIN.
- Show original VIN label while editing so the correction is obvious.
- Client-side normalize + `isValidVin` before submit.

**Confirm step (only if normalized VIN changed):**

- Dialog: change from `OLD` to `NEW`.
- Admin must retype the new VIN exactly (compare after normalize).
- Cancel returns to the form with no API call.
- Confirm proceeds with PATCH including `vin`.

**After success:**

- Re-key client `state.vehicles` from old VIN → new VIN (no ghost entry under old key).
- Update `editingVin` to the new VIN.
- Show success using existing modal feedback pattern.

**Surfaces unchanged:** yard scan UI, delivery UI, manual override (status), delete, import.

## Client state

`state.vehicles` is keyed by normalized VIN. On rename, move the vehicle object to the new key and remove the old key. Preserve all other fields from the server response / form.

## Testing (local only before ship)

### Automated

- Rename happy path: `vehicles.vin` changes; `vehicles.id` unchanged.
- Child counts for that `vehicle_id` unchanged; `scans.vin_raw` unchanged.
- Invalid VIN → `400`, DB unchanged.
- Duplicate VIN → `409`, DB unchanged.
- Omit `vin` → existing edit still works.
- Non-admin → `403`.
- Frontend re-key helper: old key gone, new key present, fields preserved.

### Manual smoke (local `npm run dev` per `.local/cli-hosts.md`, admin `ADMIN123`)

1. Vehicle with history: note status/yard/scan/flag presence.
2. Edit non-VIN fields only → still works.
3. Invalid VIN → blocked; no DB change.
4. Duplicate VIN → `409`; no merge.
5. Typo-fix to free valid VIN → confirm retype → success.
6. Open under new VIN: model/yard/status/history/flags/damage still present.
7. Yard scan with new VIN finds same vehicle.
8. Old VIN lookup not found (expected).

### Rollout

- Implement and verify on local against company Supabase project used in `backend/.env`.
- Do not run destructive seeds against production data.
- Deploy only after checklist pass and an explicit ship request.

## Out of scope

- Merging two vehicle rows when the “correct” VIN already exists.
- Rewriting historical `scans.vin_raw`.
- Audit / `vin_corrections` table.
- Allowing yard or delivery roles to edit VIN.
- Changing VIN from Manual Override or delete flows.
